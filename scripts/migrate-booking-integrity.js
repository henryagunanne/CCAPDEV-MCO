#!/usr/bin/env node

/**
 * This script migrates the booking integrity state and backfills seat allocations for existing reservations.
 * It can be run in dry-run mode or apply mode.
 * Usage:
 *   node migrate-booking-integrity.js [--apply]
 *
 * Options:
 *   --apply: Apply the migration changes to the database.
 */

'use strict';

const mongoose = require('mongoose');
const { mongoUri } = require('../config/env');
const Flight = require('../models/Flight');
const Reservation = require('../models/Reservation');
const AircraftLayout = require('../models/AircraftLayout');
const SeatAllocation = require('../models/SeatAllocation');
const BookingIntegrityState = require('../models/BookingIntegrityState');

const apply = process.argv.includes('--apply');
const SEAT_PATTERN = /^(?:[1-9]|[12][0-9]|30)[A-J]$/;

async function main() {
  await mongoose.connect(mongoUri);
  try {
    const conflicts = [];
    const reservations = await Reservation.find({
      status: { $in: ['Confirmed', 'Pending'] }
    }).lean();
    const flightIds = [...new Set(reservations.flatMap(reservation =>
      (reservation.flight || []).map(id => String(id))
    ))];
    const flights = await Flight.find({ _id: { $in: flightIds } }).lean();
    const flightById = new Map(flights.map(flight => [String(flight._id), flight]));
    const layoutIds = [...new Set(flights.map(flight => flight.aircraftLayoutId).filter(Boolean).map(String))];
    const layouts = await AircraftLayout.find({ _id: { $in: layoutIds } }).lean();
    const layoutById = new Map(layouts.map(layout => [String(layout._id), layout]));
    const expected = new Map();
    const countsByFlight = new Map();

    for (const reservation of reservations) {
      const legs = (reservation.flight || []).map(id => flightById.get(String(id)));
      if (!legs.length || legs.some(leg => !leg)) {
        conflicts.push(`MISSING_FLIGHT reservation=${reservation._id}`);
        continue;
      }
      if (reservation.tripType === 'Round-Trip' && legs.length !== 2 ||
          reservation.tripType === 'One-Way' && legs.length !== 1) {
        conflicts.push(`TRIP_FLIGHT_COUNT reservation=${reservation._id}`);
        continue;
      }
      for (const leg of legs) {
        const layout = leg.aircraftLayoutId && layoutById.get(String(leg.aircraftLayoutId));
        if (!layout || layout.seatCapacity !== leg.seatCapacity) {
          conflicts.push(`MISSING_LAYOUT flight=${leg.flightNumber} (${leg._id})`);
        }
      }
      for (let passengerIndex = 0; passengerIndex < reservation.passengers.length; passengerIndex += 1) {
        const passenger = reservation.passengers[passengerIndex];
        const selections = [passenger.seatNumber];
        if (legs.length === 2) {
          if (!passenger.returnSeatNumber) {
            conflicts.push(`MISSING_RETURN_SEAT reservation=${reservation._id} passenger=${passengerIndex + 1}`);
            continue;
          }
          selections.push(passenger.returnSeatNumber);
        }
        for (let legIndex = 0; legIndex < legs.length; legIndex += 1) {
          const flight = legs[legIndex];
          const layout = flight.aircraftLayoutId && layoutById.get(String(flight.aircraftLayoutId));
          const seatNumber = selections[legIndex];
          if (!SEAT_PATTERN.test(String(seatNumber || ''))) {
            conflicts.push(`INVALID_SEAT reservation=${reservation._id} flight=${flight._id}`);
            continue;
          }
          if (layout && !layout.seats.some(seat => seat.seatNumber === seatNumber)) {
            conflicts.push(`SEAT_NOT_IN_LAYOUT reservation=${reservation._id} flight=${flight._id} seat=${seatNumber}`);
            continue;
          }
          const key = `${flight._id}:${seatNumber}`;
          if (expected.has(key)) {
            conflicts.push(`DUPLICATE_SEAT flight=${flight.flightNumber} seat=${seatNumber} reservations=${expected.get(key).reservationId},${reservation._id}`);
            continue;
          }
          expected.set(key, {
            flightId: flight._id,
            seatNumber,
            reservationId: reservation._id,
            passengerIndex,
            attemptId: `migration-${reservation._id}`
          });
          countsByFlight.set(String(flight._id), (countsByFlight.get(String(flight._id)) || 0) + 1);
        }
      }
    }

    for (const [flightId, count] of countsByFlight) {
      const flight = flightById.get(flightId);
      if (count > flight.seatCapacity) {
        conflicts.push(`CAPACITY_EXCEEDED flight=${flight.flightNumber} count=${count} capacity=${flight.seatCapacity}`);
      }
    }

    const existing = await SeatAllocation.find({}).lean();
    const expectedByKey = new Map([...expected.entries()]);
    const existingKeys = new Set();
    for (const allocation of existing) {
      const key = `${allocation.flightId}:${allocation.seatNumber}`;
      if (existingKeys.has(key)) {
        conflicts.push(`DUPLICATE_EXISTING_ALLOCATION flight=${allocation.flightId} seat=${allocation.seatNumber}`);
        continue;
      }
      existingKeys.add(key);
      const claim = expectedByKey.get(key);
      if (!claim || String(claim.reservationId) !== String(allocation.reservationId)) {
        conflicts.push(`ALLOCATION_MISMATCH flight=${allocation.flightId} seat=${allocation.seatNumber}`);
      }
    }

    console.log(`Active reservations inspected: ${reservations.length}`);
    console.log(`Flights referenced: ${flightIds.length}`);
    console.log(`Expected seat claims: ${expected.size}`);
    console.log(`Existing allocation records: ${existing.length}`);
    console.log(`Mode: ${apply ? 'APPLY' : 'DRY RUN (no database changes)'}`);
    if (conflicts.length) {
      console.error(`Conflicts (${conflicts.length}):\n${conflicts.slice(0, 100).join('\n')}`);
      if (conflicts.length > 100) console.error(`... ${conflicts.length - 100} more conflict(s)`);
      throw new Error('Resolve all reported conflicts before applying the migration.');
    }
    if (!apply) return;

    await SeatAllocation.createIndexes();
    const indexes = await SeatAllocation.collection.listIndexes().toArray();
    const uniqueSeatIndex = indexes.find(index =>
      index.name === 'unique_flight_seat' &&
      index.unique === true &&
      index.key.flightId === 1 &&
      index.key.seatNumber === 1
    );
    if (!uniqueSeatIndex) throw new Error('MongoDB did not create the required unique flight-seat index.');

    const operations = [...expected.values()].map(allocation => ({
      updateOne: {
        filter: { flightId: allocation.flightId, seatNumber: allocation.seatNumber },
        update: { $setOnInsert: allocation },
        upsert: true
      }
    }));
    if (operations.length) await SeatAllocation.bulkWrite(operations, { ordered: true });

    for (const flight of flights) {
      await Flight.updateOne(
        { _id: flight._id },
        { $set: { bookedSeats: countsByFlight.get(String(flight._id)) || 0 } }
      );
    }
    await BookingIntegrityState.findOneAndUpdate(
      { _id: 'booking-integrity-v1' },
      {
        $set: {
          version: 1,
          ready: true,
          indexName: uniqueSeatIndex.name,
          verifiedAt: new Date()
        }
      },
      { upsert: true, new: true, runValidators: true }
    );
    console.log(`Unique index verified: ${uniqueSeatIndex.name}`);
    console.log('Seat allocations backfilled and booked-seat counters reconciled.');
  } finally {
    await mongoose.disconnect();
  }
}

main().catch(error => {
  console.error(`Booking integrity migration failed: ${error.message}`);
  process.exitCode = 1;
});
