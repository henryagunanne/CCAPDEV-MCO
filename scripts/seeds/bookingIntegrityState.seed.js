const SeatAllocation = require('../../models/SeatAllocation');
const BookingIntegrityState = require('../../models/BookingIntegrityState');
const Reservation = require('../../models/Reservation');

module.exports = async function seedBookingIntegrityState() {
  await SeatAllocation.createIndexes();
  const indexes = await SeatAllocation.collection.listIndexes().toArray();
  const unique = indexes.some(index =>
    index.name === 'unique_flight_seat' && index.unique === true &&
    index.key.flightId === 1 && index.key.seatNumber === 1
  );
  if (!unique) throw new Error('Required unique flight-seat index is missing.');

  const activeReservations = await Reservation.find({
    status: { $in: ['Confirmed', 'Pending'] }
  }).select('flight passengers tripType').lean();
  const allocations = await SeatAllocation.find({}).select('flightId seatNumber reservationId passengerIndex').lean();
  const allocationKeys = new Set(allocations.map(item =>
    `${item.reservationId}:${item.flightId}:${item.seatNumber}:${item.passengerIndex}`
  ));
  const missing = [];
  for (const reservation of activeReservations) {
    for (let legIndex = 0; legIndex < reservation.flight.length; legIndex += 1) {
      for (let passengerIndex = 0; passengerIndex < reservation.passengers.length; passengerIndex += 1) {
        const passenger = reservation.passengers[passengerIndex];
        const seatNumber = legIndex === 0 ? passenger.seatNumber : passenger.returnSeatNumber;
        const key = `${reservation._id}:${reservation.flight[legIndex]}:${seatNumber}:${passengerIndex}`;
        if (!seatNumber || !allocationKeys.has(key)) missing.push(key);
      }
    }
  }
  if (missing.length) {
    throw new Error(`Booking integrity is not ready: ${missing.length} active reservation seat claim(s) lack allocations. Run npm run migrate:booking-integrity -- --apply after reviewing its dry-run report.`);
  }

  await BookingIntegrityState.updateOne(
    { _id: 'booking-integrity-v1' },
    { $set: { version: 1, ready: true, indexName: 'unique_flight_seat', verifiedAt: new Date() } },
    { upsert: true, runValidators: true }
  );
  console.log(`Booking integrity: unique index verified and ${activeReservations.length} active reservation(s) reconciled.`);
};
