const crypto = require('crypto');
const mongoose = require('mongoose');
const Flight = require('../models/Flight');
const Reservation = require('../models/Reservation');
const AircraftLayout = require('../models/AircraftLayout');
const SeatAllocation = require('../models/SeatAllocation');
const BookingIntegrityState = require('../models/BookingIntegrityState');
const { BookingInputError } = require('./bookingValidation');
const { calculateReservationPrice } = require('./bookingPricing');


/**
 * Error thrown when there is a conflict in booking operations.
 */
class BookingConflictError extends Error {
  constructor(message) {
    super(message);
    this.name = 'BookingConflictError';
    this.statusCode = 409;
  }
}


/**
 * Check if the given error is a MongoDB duplicate key error.
 * @param {Error} error - The error to check.
 * @returns {boolean} - True if the error is a duplicate key error, false otherwise.
 */
function isDuplicateKeyError(error) {
  return error && (error.code === 11000 || error.code === 11001);
}


/**
 * Check if the current MongoDB connection supports transactions.
 * @returns {boolean} - True if transactions are supported, false otherwise.
 */
function supportsTransactions() {
  const topologyType = mongoose.connection.client?.topology?.description?.type;
  return topologyType === 'ReplicaSetWithPrimary' || topologyType === 'Sharded';
}


/** * Execute a function within a MongoDB transaction if supported.
 * @param {Function} work - The function to execute, which receives the session as an argument.
 * @returns {Promise<*>} - The result of the work function.
 */ 
async function inBookingTransaction(work) {
  if (!supportsTransactions()) return work(null);
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}


/** * Get session options for MongoDB operations, including the session if provided.
 * @param {mongoose.ClientSession|null} session - The MongoDB session to include in options.
 * @returns {Object} - The session options for MongoDB operations.
 */
function sessionOptions(session) {
  return session ? { session } : {};
}


/** * Validate the booking context for the given flights, travel class, passengers, and trip type.
 * @param {Array<string>} flightIds - Array of flight IDs to validate.
 * @param {string} travelClass - The travel class for the booking (e.g., 'Economy', 'Business').
 * @param {Array<Object>} passengers - Array of passenger objects with seat information.
 * @param {string} tripType - The type of trip ('One-Way' or 'Round-Trip').
 * @param {mongoose.ClientSession|null} session - Optional MongoDB session for transactional operations.
 * @returns {Promise<Array<Object>>} - An array of flight context objects containing flight and layout information.
 */
async function assertBookingIntegrityReady(session) {
  const state = await BookingIntegrityState.findById('booking-integrity-v1').session(session || null);
  if (!state?.ready || state.version !== 1 || state.indexName !== 'unique_flight_seat') {
    throw new BookingConflictError('Booking integrity setup is not complete. Please try again later.');
  }
}

async function resolveBookingContext(flightIds, travelClass, passengers, tripType, session) {
  await assertBookingIntegrityReady(session);
  const flights = [];
  for (const flightId of flightIds) {
    const flight = await Flight.findById(flightId).session(session || null);
    if (!flight) throw new BookingInputError('Selected flight was not found.', 404);
    if (flight.status === 'Cancelled') {
      throw new BookingInputError('A selected flight is not available for booking.', 409);
    }
    if (!['Scheduled', 'On Time', 'Delayed'].includes(flight.status)) {
      throw new BookingInputError('A selected flight is not available for booking.', 409);
    }
    const departureDate = new Date(`${flight.departureDate}T${flight.departureTime || '00:00'}:00`);
    if (Number.isNaN(departureDate.getTime()) || flight.departureDate < new Date().toISOString().slice(0, 10)) {
      throw new BookingInputError('A selected flight date is invalid or has passed.');
    }
    if (!Number.isFinite(flight.price) || flight.price < 0 ||
        !Number.isInteger(flight.seatCapacity) || flight.seatCapacity < 1) {
      throw new BookingInputError('A selected flight has invalid fare or capacity data.', 409);
    }
    if (!flight.aircraftLayoutId) {
      throw new BookingConflictError('Seat layout setup is required before this flight can be booked.');
    }
    const layout = await AircraftLayout.findOne({
      _id: flight.aircraftLayoutId,
      active: true
    }).session(session || null);
    if (!layout || layout.seatCapacity !== flight.seatCapacity ||
        layout.aircraftType !== flight.aircraft) {
      throw new BookingConflictError('Seat layout setup is incomplete for this flight.');
    }
    flights.push({ flight, layout });
  }

  if (tripType === 'Round-Trip') {
    const [outbound, returning] = flights.map(entry => entry.flight);
    if (outbound.origin !== returning.destination ||
        outbound.destination !== returning.origin ||
        returning.departureDate <= outbound.departureDate) {
      throw new BookingInputError('Return flight must reverse the outbound route and depart later.');
    }
  }

  for (const passenger of passengers) {
    const seatNumbers = tripType === 'Round-Trip'
      ? [passenger.seatNumber, passenger.returnSeatNumber]
      : [passenger.seatNumber];
    for (let i = 0; i < flights.length; i += 1) {
      const seat = flights[i].layout.seats.find(item => item.seatNumber === seatNumbers[i]);
      if (!seat) throw new BookingInputError('A selected seat is not present in the flight layout.');
      if (seat.travelClass !== travelClass) {
        throw new BookingInputError('Selected seats must match the reservation travel class.');
      }
    }
  }

  return flights;
}


/** * Generate seat claims for passengers based on flights and trip type.
 * @param {Array<Object>} flights - Array of flight context objects containing flight information.
 * @param {Array<Object>} passengers - Array of passenger objects with seat information.
 * @param {string} tripType - The type of trip ('One-Way' or 'Round-Trip').
 * @returns {Array<Object>} - An array of seat claim objects for each passenger and flight.
 */
function claimsForPassengers(flights, passengers, tripType) {
  const claims = [];
  passengers.forEach((passenger, passengerIndex) => {
    claims.push({
      flightId: flights[0]._id,
      seatNumber: passenger.seatNumber,
      passengerIndex
    });
    if (tripType === 'Round-Trip') {
      claims.push({
        flightId: flights[1]._id,
        seatNumber: passenger.returnSeatNumber,
        passengerIndex
      });
    }
  });
  return claims;
}


/** * Group seat claims by flight ID and count the number of claims for each flight.
 * @param {Array<Object>} claims - Array of seat claim objects with flightId and seatNumber.
 * @returns {Map<string, number>} - A map where keys are flight IDs and values are the count of claims for that flight.
 */
function groupByFlight(claims) {
  const groups = new Map();
  for (const claim of claims) {
    const flightId = String(claim.flightId);
    groups.set(flightId, (groups.get(flightId) || 0) + 1);
  }
  return groups;
}


/** * Change the booked seat count for a flight by a specified amount.
 * @param {string} flightId - The ID of the flight.
 * @param {number} count - The number of seats to change.
 * @param {number} direction - The direction of the change (1 for increment, -1 for decrement).
 * @param {mongoose.ClientSession|null} session - Optional MongoDB session for transactional operations.
 * @returns {Promise<void>}
 */ 
async function changeBookedSeats(flightId, count, direction, session) {
  const query = { _id: flightId };
  if (direction > 0) {
    query.$expr = {
      $lte: [
        { $add: [{ $ifNull: ['$bookedSeats', 0] }, count] },
        '$seatCapacity'
      ]
    };
  } else {
    query.bookedSeats = { $gte: count };
  }
  const result = await Flight.updateOne(query, { $inc: { bookedSeats: direction * count } }, sessionOptions(session));
  if (result.modifiedCount !== 1) {
    if (direction > 0) throw new BookingConflictError('Flight capacity is no longer available.');
    throw new Error(`Booked-seat counter could not be adjusted for flight ${flightId}.`);
  }
}


/** * Claim seats for a reservation by creating seat allocation documents and updating booked seat counts. 
 * @param {string} reservationId - The ID of the reservation.
 * @param {Array<Object>} claims - Array of seat claim objects with flightId, seatNumber, and passengerIndex.
 * @param {mongoose.ClientSession|null} session - Optional MongoDB session for transactional operations.
 * @returns {Promise<Array<Object>>} - An array of created seat allocation documents.
 * */
async function claimSeats(reservationId, claims, session) {
  const attemptId = crypto.randomUUID();
  const documents = claims.map(claim => ({
    _id: new mongoose.Types.ObjectId(),
    ...claim,
    reservationId,
    attemptId
  }));
  const incremented = [];
  try {
    await SeatAllocation.insertMany(documents, { ordered: true, ...sessionOptions(session) });
    for (const [flightId, count] of groupByFlight(claims)) {
      await changeBookedSeats(flightId, count, 1, session);
      incremented.push([flightId, count]);
    }
    return documents;
  } catch (error) {
    if (session) throw error;
    const cleanupErrors = [];
    try {
      await SeatAllocation.deleteMany({ _id: { $in: documents.map(document => document._id) } });
    } catch (cleanupError) {
      cleanupErrors.push(cleanupError);
    }
    for (const [flightId, count] of incremented.reverse()) {
      try {
        await changeBookedSeats(flightId, count, -1, null);
      } catch (cleanupError) {
        cleanupErrors.push(cleanupError);
      }
    }
    if (cleanupErrors.length) {
      const consistencyError = new Error('Booking failed and compensating seat cleanup was incomplete.');
      consistencyError.cause = error;
      consistencyError.cleanupErrors = cleanupErrors;
      throw consistencyError;
    }
    if (isDuplicateKeyError(error)) {
      throw new BookingConflictError('A selected seat is no longer available.');
    }
    throw error;
  }
}


/** * Release seat allocations by deleting allocation documents and updating booked seat counts.
 * @param {Array<Object>} allocations - Array of seat allocation objects to release.
 * @param {mongoose.ClientSession|null} session - Optional MongoDB session for transactional operations.
 * @returns {Promise<Array<Object>>} - An array of released seat allocation documents.
 */
async function releaseSeatAllocations(allocations, session) {
  const removed = [];
  const decremented = [];
  try {
    for (const allocation of allocations) {
      const result = await SeatAllocation.deleteOne({ _id: allocation._id }, sessionOptions(session));
      if (result.deletedCount === 1) removed.push(allocation);
    }
    for (const [flightId, count] of groupByFlight(removed)) {
      await changeBookedSeats(flightId, count, -1, session);
      decremented.push([flightId, count]);
    }
  } catch (error) {
    if (session) throw error;
    const cleanupErrors = [];
    for (const [flightId, count] of decremented.reverse()) {
      try {
        await changeBookedSeats(flightId, count, 1, null);
      } catch (cleanupError) {
        cleanupErrors.push(cleanupError);
      }
    }
    if (removed.length) {
      try {
        await SeatAllocation.insertMany(removed, { ordered: true });
      } catch (cleanupError) {
        cleanupErrors.push(cleanupError);
      }
    }
    if (cleanupErrors.length) {
      const consistencyError = new Error('Seat release failed and rollback was incomplete.');
      consistencyError.cause = error;
      consistencyError.cleanupErrors = cleanupErrors;
      throw consistencyError;
    }
    throw error;
  }
  return removed;
}


/** * Generate a unique booking reference for a reservation.
 * @returns {string} - A unique booking reference string.
 */
function makeBookingReference() {
  return `AA${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
}


/** * Create a new reservation with the given user ID and booking details.
 * @param {Object} params - The parameters for creating the reservation.
 * @param {string} params.userId - The ID of the user making the reservation.
 * @param {Object} params.booking - The booking details.
 * @returns {Promise<Reservation>} - A promise resolving to the created reservation.
 */
async function createReservation({ userId, booking }) {
  const flightContext = await resolveBookingContext(
    booking.flightIds, booking.travelClass, booking.passengers, booking.tripType, null
  );
  const price = calculateReservationPrice(
    flightContext.map(entry => entry.flight),
    booking.passengers,
    booking.travelClass
  );
  const reservation = new Reservation({
    userId,
    bookingReference: makeBookingReference(),
    flight: flightContext.map(entry => entry.flight._id),
    tripType: booking.tripType,
    travelClass: booking.travelClass,
    passengers: booking.passengers,
    price,
    status: 'Confirmed'
  });
  const claims = claimsForPassengers(flightContext.map(entry => entry.flight), booking.passengers, booking.tripType);

  let createdAllocations = [];
  return inBookingTransaction(async session => {
    const created = new Reservation(reservation.toObject());
    try {
      createdAllocations = await claimSeats(created._id, claims, session);
      await created.save(sessionOptions(session));
      return created;
    } catch (error) {
      if (!session && createdAllocations.length) {
        await releaseSeatAllocations(createdAllocations, null);
      }
      throw error;
    }
  }).catch(error => {
    if (isDuplicateKeyError(error)) {
      throw new BookingConflictError('A selected seat or passenger passport is already in use.');
    }
    throw error;
  });
}


/** * Compare two seat claims to determine if they refer to the same flight and seat.
 * @param {Object} left - The first seat claim object.
 * @param {Object} right - The second seat claim object.
 * @returns {boolean} - True if both claims refer to the same flight and seat, false otherwise.
 */
function sameClaim(left, right) {
  return String(left.flightId) === String(right.flightId) &&
    left.seatNumber === right.seatNumber;
}


/** * Update an existing reservation with new passenger information.
 * @param {Object} params - The parameters for updating the reservation.
 * @param {Reservation} params.reservation - The reservation to update.
 * @param {Array<Object>} params.passengers - The new passenger information.
 * @returns {Promise<Reservation>} - A promise resolving to the updated reservation.
 */
async function updateReservation({ reservation, passengers }) {
  if (reservation.status === 'Cancelled') {
    throw new BookingConflictError('Cancelled reservations cannot be edited.');
  }
  const flightIds = reservation.flight.map(id => String(id));
  const flightContext = await resolveBookingContext(
    flightIds, reservation.travelClass, passengers, reservation.tripType, null
  );
  const price = calculateReservationPrice(
    flightContext.map(entry => entry.flight), passengers, reservation.travelClass
  );
  const oldAllocations = await SeatAllocation.find({ reservationId: reservation._id }).lean();
  const oldClaims = oldAllocations.map(allocation => ({
    flightId: allocation.flightId,
    seatNumber: allocation.seatNumber
  }));
  const newClaims = claimsForPassengers(
    flightContext.map(entry => entry.flight), passengers, reservation.tripType
  );
  if (oldClaims.length === 0) {
    throw new BookingConflictError('Seat-allocation migration is required before editing this reservation.');
  }
  const additions = newClaims.filter(claim => !oldClaims.some(old => sameClaim(old, claim)));
  const removals = oldAllocations.filter(allocation =>
    !newClaims.some(claim => sameClaim(allocation, claim))
  );
  const oldPassengers = reservation.passengers.toObject
    ? reservation.passengers.toObject()
    : reservation.passengers.map(passenger => passenger.toObject ? passenger.toObject() : passenger);
  const oldPrice = reservation.price;
  const oldVersion = reservation.__v;
  let addedAllocations = [];
  const updatedPassengers = passengers.map((passenger, index) => {
    const existing = reservation.passengers[index];
    return {
      ...passenger,
      checkedIn: existing?.checkedIn || false,
      boardingPass: existing?.boardingPass || { outbound: null, return: null }
    };
  });

  return inBookingTransaction(async session => {
    if (additions.length) {
      addedAllocations = await claimSeats(reservation._id, additions, session);
    }
    reservation.passengers = updatedPassengers;
    reservation.price = price;
    await reservation.save(sessionOptions(session));
    if (removals.length) await releaseSeatAllocations(removals, session);
    return reservation;
  }).catch(async error => {
    if (supportsTransactions()) {
      if (isDuplicateKeyError(error)) {
        throw new BookingConflictError('A selected seat is no longer available.');
      }
      throw error;
    }
    const rollbackErrors = [];
    try {
      await Reservation.updateOne(
        { _id: reservation._id, __v: oldVersion + 1 },
        { $set: { passengers: oldPassengers, price: oldPrice }, $inc: { __v: 1 } }
      );
    } catch (rollbackError) {
      rollbackErrors.push(rollbackError);
    }
    if (addedAllocations.length) {
      try {
        await releaseSeatAllocations(addedAllocations, null);
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError);
      }
    }
    if (rollbackErrors.length) {
      const consistencyError = new Error('Reservation edit failed and compensating cleanup was incomplete.');
      consistencyError.cause = error;
      consistencyError.cleanupErrors = rollbackErrors;
      throw consistencyError;
    }
    if (isDuplicateKeyError(error)) {
      throw new BookingConflictError('A selected seat is no longer available.');
    }
    throw error;
  });
}


/** * Cancel an existing reservation, releasing any claimed seats.
 * @param {Reservation} reservation - The reservation to cancel.
 * @returns {Promise<Reservation>} - A promise resolving to the cancelled reservation.
 */
async function cancelReservation(reservation) {
  if (supportsTransactions()) {
    return inBookingTransaction(async session => {
      const current = await Reservation.findById(reservation._id).session(session);
      if (!current) return null;
      if (current.status === 'Cancelled') return current;
      const allocations = await SeatAllocation.find({ reservationId: current._id }).session(session).lean();
      if (!allocations.length && current.passengers.some(passenger => passenger.seatNumber)) {
        throw new BookingConflictError('Seat-allocation migration is required before cancellation.');
      }
      const update = await Reservation.updateOne(
        { _id: current._id, __v: current.__v, status: { $ne: 'Cancelled' } },
        { $set: { status: 'Cancelled' }, $inc: { __v: 1 } },
        { session }
      );
      if (update.modifiedCount !== 1) {
        throw new BookingConflictError('Reservation changed; reload and try again.');
      }
      await releaseSeatAllocations(allocations, session);
      return Reservation.findById(current._id).session(session);
    });
  }

  if (reservation.status === 'Cancelled') return reservation;
  const allocations = await SeatAllocation.find({ reservationId: reservation._id }).lean();
  if (!allocations.length && reservation.passengers.some(passenger => passenger.seatNumber)) {
    throw new BookingConflictError('Seat-allocation migration is required before cancellation.');
  }
  const priorStatus = reservation.status;
  const priorVersion = reservation.__v;
  const update = await Reservation.updateOne(
    { _id: reservation._id, __v: priorVersion, status: { $ne: 'Cancelled' } },
    { $set: { status: 'Cancelled' }, $inc: { __v: 1 } }
  );
  if (update.modifiedCount !== 1) {
    const current = await Reservation.findById(reservation._id);
    if (current?.status === 'Cancelled') return current;
    throw new BookingConflictError('Reservation changed; reload and try again.');
  }
  try {
    await releaseSeatAllocations(allocations, null);
  } catch (error) {
    await Reservation.updateOne(
      { _id: reservation._id, status: 'Cancelled', __v: priorVersion + 1 },
      { $set: { status: priorStatus }, $inc: { __v: 1 } }
    );
    throw error;
  }
  return Reservation.findById(reservation._id);
}


/** * Delete a reservation, cancelling it first if necessary.
 * @param {Reservation} reservation - The reservation to delete.
 * @returns {Promise<void>}
 * */
async function deleteReservation(reservation) {
  if (reservation.status !== 'Cancelled') await cancelReservation(reservation);
  await Reservation.deleteOne({ _id: reservation._id, status: 'Cancelled' });
}

module.exports = {
  BookingConflictError,
  createReservation,
  updateReservation,
  cancelReservation,
  deleteReservation,
  resolveBookingContext,
  claimsForPassengers,
  changeBookedSeats,
  supportsTransactions
};
