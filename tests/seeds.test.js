const User = require('../models/User');
const Flight = require('../models/Flight');
const Reservation = require('../models/Reservation');
const SeatAllocation = require('../models/SeatAllocation');
const PopularFlight = require('../models/popularFlight');
const seedUsers = require('../scripts/seeds/users.seed');
const seedAircraftLayouts = require('../scripts/seeds/aircraftLayouts.seed');
const seedFlights = require('../scripts/seeds/flights.seed');
const seedReservations = require('../scripts/seeds/reservations.seed');
const seedSeatAllocations = require('../scripts/seeds/seatAllocations.seed');
const seedBookingIntegrityState = require('../scripts/seeds/bookingIntegrityState.seed');
const seedPopularFlights = require('../scripts/seeds/popularFlights.seed');

async function runSeedSteps() {
  await seedUsers();
  await seedAircraftLayouts();
  await seedFlights();
  await seedReservations();
  await seedSeatAllocations();
  await seedBookingIntegrityState();
  await seedPopularFlights();
}

describe('repeatable database seed modules', () => {
  test('creates connected fixtures and does not duplicate them on a second run', async () => {
    await runSeedSteps();
    await runSeedSteps();

    expect(await User.countDocuments({ email: /@archers-airline\.invalid$/ })).toBe(3);
    expect(await Flight.countDocuments({ flightNumber: /^AA900/ })).toBe(3);
    expect(await Reservation.countDocuments({ bookingReference: /^SEED-AAR/ })).toBe(2);
    expect(await SeatAllocation.countDocuments({ attemptId: /^seed-/ })).toBe(2);
    expect(await PopularFlight.countDocuments({
      flight: { $in: await Flight.find({ flightNumber: /^AA900/ }).distinct('_id') }
    })).toBe(3);

    const seededReservations = await Reservation.find({ bookingReference: /^SEED-AAR/ }).lean();
    for (const reservation of seededReservations) {
      expect(await User.exists({ _id: reservation.userId })).not.toBeNull();
      for (const flightId of reservation.flight) {
        expect(await Flight.exists({ _id: flightId })).not.toBeNull();
      }
    }
  });
});
