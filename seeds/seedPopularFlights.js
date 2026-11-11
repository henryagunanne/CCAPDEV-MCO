const PopularFlight = require('../models/popularFlight');
const Flight = require('../models/Flight');

async function seedPopularFlights() {
  const count = await PopularFlight.countDocuments();

  if (count > 0) {
    console.log('Popular Flights already exist — skipping seeding.');
    return;
  }

  console.log('Seeding Popular Flights collection...');

  // Use Flight documents that actually exist. Prefer the old featured flight
  // numbers when present, then fill any missing entries from the current record.
  const preferredFlightNumbers = [
    'AA1033', 'AA1036', 'AA1013', 'AA1005',
    'AA1029', 'AA1052', 'AA1056', 'AA1064',
    'AA1076', 'AA1089', 'AA1320', 'AA1205'
  ];

  const allFlights = await Flight.find({}).sort({ flightNumber: 1 }).lean();

  if (allFlights.length === 0) {
    console.log('No flight records found. Seed Flights before Popular Flights.');
    return;
  }

  const selectedFlights = [];
  const selectedIds = new Set();

  // First, add preferred flights if they exist
  for (const flightNumber of preferredFlightNumbers) {
    const flight = allFlights.find(f => f.flightNumber === flightNumber);
    if (flight && !selectedIds.has(String(flight._id))) {
      selectedFlights.push(flight);
      selectedIds.add(String(flight._id));
    }
  }

  // Then, fill in with other flights until we have 12
  for (const flight of allFlights) {
    if (selectedFlights.length >= 12) break;
    if (!selectedIds.has(String(flight._id))) {
      selectedFlights.push(flight);
      selectedIds.add(String(flight._id));
    }
  }

  // Preserve the existing featured-flight class/trip-type pattern and images.
  const featuredOptions = [
    { travelClass: 'Economy', tripType: 'One-Way', image: '/assets/cities/hongkong.png' },
    { travelClass: 'Business', tripType: 'One-Way', image: '/assets/cities/australia.jpg' },
    { travelClass: 'Premium Economy', tripType: 'One-Way', image: '/assets/cities/tokyo.png' },
    { travelClass: 'First', tripType: 'Round-Trip', image: '/assets/cities/davao.jpg' },
    { travelClass: 'Economy', tripType: 'One-Way', image: '/assets/cities/shanghai.jpg' },
    { travelClass: 'Business', tripType: 'Round-Trip', image: '/assets/cities/hanoi.png' },
    { travelClass: 'Economy', tripType: 'Round-Trip', image: '/assets/cities/Ho Chi Minh City.png' },
    { travelClass: 'Economy', tripType: 'One-Way', image: '/assets/cities/tapei.png' },
    { travelClass: 'Economy', tripType: 'One-Way', image: '/assets/cities/seoul.png' },
    { travelClass: 'Economy', tripType: 'Round-Trip', image: '/assets/cities/singapore.png' },
    { travelClass: 'Economy', tripType: 'One-Way', image: '/assets/cities/thailand.png' },
    { travelClass: 'Economy', tripType: 'Round-Trip', image: '/assets/cities/Malaysia.png' }
  ];

  const popularFlights = selectedFlights.map((flight, index) => {
    // Keep the promotion/travel window tied to the actual flight's date.
    // departureDate is stored as YYYY-MM-DD by seedFlights.
    const departureDate = new Date(`${flight.departureDate}T00:00:00`);
    const endDate = new Date(departureDate);
    endDate.setDate(endDate.getDate() + 30);

    const options = featuredOptions[index % featuredOptions.length];

    return {
      flight: flight._id,
      startDate: departureDate,
      endDate,
      travelClass: options.travelClass,
      tripType: options.tripType,
      image: options.image
    };
  });

  await PopularFlight.insertMany(popularFlights);
  console.log(`Popular Flights successfully seeded (${popularFlights.length} records).`);
}

module.exports = seedPopularFlights;
