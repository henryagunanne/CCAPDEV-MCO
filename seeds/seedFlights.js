const Flight = require('../models/Flight');

async function seedFlights() {
  const count = await Flight.countDocuments();

  if (count === 0) {
    console.log('🌱 Seeding Flights collection...');

     // 🌍 All available cities
  const cities = [
    'Manila (MNL)', 'Cebu (CEB)', 'Davao (DVO)', 'Clark (CRK)',
    'Tokyo (HND)', 'Osaka (KIX)', 'Nagoya (NGO)',
    'Beijing (PEK)', 'Shanghai (PVG)', 'Hong Kong (HKG)',
    'Sydney (SYD)', 'Melbourne (MEL)', 'Brisbane (BNE)', 'Perth (PER)',
    'Hanoi (HAN)', 'Ho Chi Minh City (SGN)', 'Da Nang (DAD)',
    'Taipei (TPE)', 'Kaohsiung (KHH)', 'Taichung (RMQ)',
    'Seoul (ICN)', 'Busan (PUS)', 'Jeju (CJU)',
    'Bangkok (BKK)', 'Chiang Mai (CNX)', 'Phuket (HKT)',
    'Singapore (SIN)', 'Seletar (XSP)', 'Paya Lebar (QPG)',
    'Shek Kong (VHSK)'
  ];

  // ✈️ Aircraft options
  const aircrafts = [
    'Airbus A320', 'Airbus A320neo', 'Airbus A321', 'Airbus A321neo',
    'Airbus A330', 'Airbus A350',
    'Boeing 737', 'Boeing 777', 'Boeing 787',
    'Boeing 787 Dreamliner', 'Boeing 737 MAX',
    'Embraer E190', 'Bombardier CRJ900'
  ];

  const statuses = ['Scheduled', 'On Time', 'Delayed'];

  const flights = [];
  let flightNumberCounter = 1000;

  // Helper to generate a single random flight
  const createFlight = (origin, destination) => {
    const depDate = new Date(2025, 10, 20 + Math.floor(Math.random() * 10)); // random day in Nov 2025
    const depHour = 6 + Math.floor(Math.random() * 12); // 6AM–6PM
    const depMin = Math.random() > 0.5 ? '00' : '30';
    const arrHour = depHour + 2 + Math.floor(Math.random() * 3); // 2–5 hr duration

    return {
      flightNumber: `AA${flightNumberCounter++}`,
      origin,
      destination,
      departureDate: depDate.toISOString().split('T')[0],
      departureTime: `${String(depHour).padStart(2, '0')}:${depMin}`,
      arrivalTime: `${String(arrHour).padStart(2, '0')}:${depMin}`,
      aircraft: aircrafts[Math.floor(Math.random() * aircrafts.length)],
      seatCapacity: 150 + Math.floor(Math.random() * 80),
      price: 120 + Math.floor(Math.random() * 400),
      status: statuses[Math.floor(Math.random() * statuses.length)]
    };
  };

  // Generate flights for each unique city pair
  for (let i = 0; i < cities.length; i++) {
    for (let j = i + 1; j < cities.length; j++) {
      const origin = cities[i];
      const destination = cities[j];

      // Two outgoing flights
      for (let k = 0; k < 2; k++) {
        flights.push(createFlight(origin, destination));
      }

      // Two return flights
      for (let k = 0; k < 2; k++) {
        flights.push(createFlight(destination, origin));
      }
    }
  }

  await Flight.insertMany(flights);
  console.log(`✅ Seeded ${flights.length} flights.`);
  } else {
    console.log('🛫 Flights already exist — skipping seeding.');
  }
}

module.exports = seedFlights;
