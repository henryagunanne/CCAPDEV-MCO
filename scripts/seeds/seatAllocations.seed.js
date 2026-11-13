const Reservation = require('../../models/Reservation');
const SeatAllocation = require('../../models/SeatAllocation');
const Flight = require('../../models/Flight');

module.exports = async function seedSeatAllocations() {
  // Enforce uniqueness before attempting to write any fixture allocation.
  await SeatAllocation.createIndexes();
  const reservations = await Reservation.find({ bookingReference: /^SEED-AAR/ }).lean();
  let created = 0;
  for (const reservation of reservations) {
    const flight = await Flight.findById(reservation.flight[0]).lean();
    if (!flight) throw new Error(`Seed reservation ${reservation.bookingReference} references a missing flight.`);
    for (let passengerIndex = 0; passengerIndex < reservation.passengers.length; passengerIndex += 1) {
      const seatNumber = reservation.passengers[passengerIndex].seatNumber;
      const existing = await SeatAllocation.findOne({ flightId: flight._id, seatNumber }).lean();
      if (existing && String(existing.reservationId) !== String(reservation._id)) {
        throw new Error(`Seed seat conflict: ${flight.flightNumber} ${seatNumber} is already allocated to another reservation.`);
      }
      if (!existing) {
        await SeatAllocation.create({
          flightId: flight._id, seatNumber, reservationId: reservation._id,
          passengerIndex, attemptId: `seed-${reservation.bookingReference}`
        });
        created += 1;
      }
    }
    const count = await SeatAllocation.countDocuments({ flightId: flight._id });
    await Flight.updateOne({ _id: flight._id }, { $set: { bookedSeats: count } });
  }
  console.log(`Seat allocations: ${created} new fixture allocation(s).`);
};
