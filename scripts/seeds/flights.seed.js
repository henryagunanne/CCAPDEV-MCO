const Flight = require('../../models/Flight');
const AircraftLayout = require('../../models/AircraftLayout');
const { ensureAircraftLayout } = require('../../services/seatAllocationService');

module.exports = async function seedFlights() {
  const fixtures = [
    { flightNumber: 'AA9001', origin: 'Manila (MNL)', destination: 'Cebu (CEB)', departureDate: '2027-01-15', departureTime: '08:00', arrivalTime: '09:30', aircraft: 'Airbus A320', seatCapacity: 154, price: 3200, status: 'Scheduled' },
    { flightNumber: 'AA9002', origin: 'Cebu (CEB)', destination: 'Manila (MNL)', departureDate: '2027-01-20', departureTime: '17:00', arrivalTime: '18:30', aircraft: 'Airbus A320', seatCapacity: 154, price: 3400, status: 'Scheduled' },
    { flightNumber: 'AA9003', origin: 'Manila (MNL)', destination: 'Singapore (SIN)', departureDate: '2027-02-10', departureTime: '10:00', arrivalTime: '13:45', aircraft: 'Boeing 737', seatCapacity: 195, price: 8900, status: 'On Time' }
  ];
  let created = 0;
  for (const fixture of fixtures) {
    const layout = await ensureAircraftLayout(fixture.aircraft, fixture.seatCapacity);
    const result = await Flight.updateOne(
      { flightNumber: fixture.flightNumber },
      { $setOnInsert: { ...fixture, bookedSeats: 0, aircraftLayoutId: layout._id } },
      { upsert: true, runValidators: true }
    );
    if (result.upsertedCount) created += 1;
    const savedFlight = await Flight.findOne({ flightNumber: fixture.flightNumber });
    if (!savedFlight || savedFlight.aircraft !== fixture.aircraft ||
        savedFlight.seatCapacity !== fixture.seatCapacity) {
      throw new Error(`Existing fixture flight ${fixture.flightNumber} has a conflicting aircraft or capacity; it was not overwritten.`);
    }
    if (!savedFlight.aircraftLayoutId) {
      savedFlight.aircraftLayoutId = layout._id;
      await savedFlight.save();
    } else {
      const attachedLayout = await AircraftLayout.findById(savedFlight.aircraftLayoutId).lean();
      if (!attachedLayout || attachedLayout.seatCapacity !== savedFlight.seatCapacity ||
          attachedLayout.aircraftType !== savedFlight.aircraft) {
        throw new Error(`Fixture flight ${fixture.flightNumber} has an inconsistent aircraft layout reference.`);
      }
    }
  }
  console.log(`Flights: ${created} new fixture flight(s); existing flights preserved.`);
};
