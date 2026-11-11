const Flight = require('../models/Flight');

async function seedFlights() {
  const count = await Flight.countDocuments();

  if (count === 0) {
    console.log('Seeding Flights collection...');

    // All available cities
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

    // Aircraft options
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

    // Generate a date between November 2026 and December 2027.
    // Build the YYYY-MM-DD value using local date parts to avoid UTC date shifts.
    const createDepartureDate = () => {
      const start = new Date(2026, 10, 1); // November 1, 2026
      const end = new Date(2027, 11, 31);  // December 31, 2027
      const days = Math.floor((end - start) / (24 * 60 * 60 * 1000));
      const date = new Date(start);
      date.setDate(start.getDate() + Math.floor(Math.random() * (days + 1)));

      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    // Helper to generate a single flight
    const createFlight = (origin, destination) => {
      const depHour = 6 + Math.floor(Math.random() * 12); // 06:00–17:30
      const depMin = Math.random() > 0.5 ? '00' : '30';
      const durationHours = 2 + Math.floor(Math.random() * 4); // 2–5 hours
      const arrHour = depHour + durationHours;

      return {
        flightNumber: `AA${flightNumberCounter++}`,
        origin,
        destination,
        departureDate: createDepartureDate(),
        departureTime: `${String(depHour).padStart(2, '0')}:${depMin}`,
        arrivalTime: `${String(arrHour).padStart(2, '0')}:${depMin}`,
        aircraft: aircrafts[Math.floor(Math.random() * aircrafts.length)],
        seatCapacity: 150 + Math.floor(Math.random() * 80),
        price: 120 + Math.floor(Math.random() * 400),
        status: statuses[Math.floor(Math.random() * statuses.length)]
      };
    };

    // Generate four outgoing and four return flights for each unique city pair
    for (let i = 0; i < cities.length; i++) {
      for (let j = i + 1; j < cities.length; j++) {
        const origin = cities[i];
        const destination = cities[j];

        for (let k = 0; k < 4; k++) {
          flights.push(createFlight(origin, destination));
          flights.push(createFlight(destination, origin));
        }
      }
    }

    await Flight.insertMany(flights);
    console.log(`Seeded ${flights.length} flights.`);
  } else {
    console.log('Flights already exist — skipping seeding.');
  }
}

module.exports = seedFlights;
