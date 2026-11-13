const Flight = require('../../models/Flight');
const PopularFlight = require('../../models/popularFlight');

module.exports = async function seedPopularFlights() {
  const flights = await Flight.find({ flightNumber: { $in: ['AA9001', 'AA9002', 'AA9003'] } }).lean();
  let created = 0;
  for (const [index, flight] of flights.entries()) {
    const startDate = new Date(`${flight.departureDate}T00:00:00.000Z`);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 30);
    const result = await PopularFlight.updateOne(
      { flight: flight._id },
      { $setOnInsert: {
        flight: flight._id, startDate, endDate,
        travelClass: ['Economy', 'Business', 'Premium Economy'][index % 3],
        tripType: 'One-Way'
      } },
      { upsert: true, runValidators: true }
    );
    if (result.upsertedCount) created += 1;
  }
  console.log(`Popular flights: ${created} new fixture record(s).`);
};
