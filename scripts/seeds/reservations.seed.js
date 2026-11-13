const User = require('../../models/User');
const Flight = require('../../models/Flight');
const Reservation = require('../../models/Reservation');

module.exports = async function seedReservations() {
  const customers = await User.find({ email: { $in: [
    'seed.customer.one@archers-airline.invalid',
    'seed.customer.two@archers-airline.invalid'
  ] } }).sort({ email: 1 }).lean();
  const flights = await Flight.find({ flightNumber: { $in: ['AA9001', 'AA9003'] } }).lean();
  if (customers.length !== 2 || flights.length !== 2) {
    throw new Error('Reservation fixtures require the seeded customers and flights.');
  }
  const fixtures = [
    {
      userId: customers[0]._id, bookingReference: 'SEED-AAR9001',
      flight: [flights.find(f => f.flightNumber === 'AA9001')._id],
      tripType: 'One-Way', travelClass: 'Economy',
      passengers: [{ fullName: 'Demo Passenger One', ageCategory: 'Adult 12+', gender: 'Female', seatNumber: '12A', meal: 'None', baggageAllowance: 20 }],
      price: 3200, status: 'Confirmed', bookingDate: new Date('2026-11-01T00:00:00Z')
    },
    {
      userId: customers[1]._id, bookingReference: 'SEED-AAR9003',
      flight: [flights.find(f => f.flightNumber === 'AA9003')._id],
      tripType: 'One-Way', travelClass: 'Economy',
      passengers: [{ fullName: 'Demo Passenger Two', ageCategory: 'Adult 12+', gender: 'Male', seatNumber: '14A', meal: 'None', baggageAllowance: 15 }],
      price: 8900, status: 'Confirmed', bookingDate: new Date('2026-11-02T00:00:00Z')
    }
  ];
  let created = 0;
  for (const fixture of fixtures) {
    const result = await Reservation.updateOne(
      { bookingReference: fixture.bookingReference },
      { $setOnInsert: fixture },
      { upsert: true, runValidators: true }
    );
    if (result.upsertedCount) created += 1;
    const saved = await Reservation.findOne({ bookingReference: fixture.bookingReference }).lean();
    if (!saved || String(saved.userId) !== String(fixture.userId) ||
        saved.flight.length !== fixture.flight.length ||
        saved.flight.some((id, index) => String(id) !== String(fixture.flight[index]))) {
      throw new Error(`Existing fixture reservation ${fixture.bookingReference} has inconsistent user/flight references.`);
    }
  }
  console.log(`Reservations: ${created} new fixture reservation(s).`);
};
