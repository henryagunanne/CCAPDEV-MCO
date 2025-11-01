const PopularFlight = require('../models/PopularFlight');
const Flight = require('../models/Flight');

async function seedPopularFlights() {
  const count = await PopularFlight.countDocuments();

  if (count === 0) {
    console.log('🌱 Seeding Popular Flights collection...');

    // Get flights from the database
    const flights = await Flight.find({
      flightNumber: { $in: [
        'AA1001', 'AA1002', 'AA1003', 'AA1004',
        'AA2015', 'AA1021', 'AA1022', 'AA1023'
      ]}
    });

    await PopularFlight.insertMany([
      {
        flight: flights.find(f => f.flightNumber === 'AA1001')._id,
        startDate: new Date('2025-11-10'),
        endDate: new Date('2025-12-10'),
        tripType: 'One-Way',
        image: '/assets/cities/hongkong.png'
      },
      {
        flight: flights.find(f => f.flightNumber === 'AA1002')._id,
        startDate: new Date('2025-11-15'),
        endDate: new Date('2025-12-15'),
        tripType: 'Round-Trip',
        image: '/assets/cities/singapore.png'
      },
      {
        flight: flights.find(f => f.flightNumber === 'AA1003')._id,
        startDate: new Date('2025-11-20'),
        endDate: new Date('2025-12-20'),
        tripType: 'One-Way',
        image: '/assets/cities/thailand.png'
      },
      {
        flight: flights.find(f => f.flightNumber === 'AA1004')._id,
        startDate: new Date('2025-11-25'),
        endDate: new Date('2025-12-25'),
        tripType: 'One-Way',
        image: '/assets/cities/tokyo.png'
      },
      {
        flight: flights.find(f => f.flightNumber === 'AA2015')._id,
        startDate: new Date('2025-11-05'),
        endDate: new Date('2025-12-05'),
        tripType: 'Round-Trip',
        image: '/assets/cities/Malaysia.png'
      },
      {
        flight: flights.find(f => f.flightNumber === 'AA1021')._id,
        startDate: new Date('2025-11-12'),
        endDate: new Date('2025-12-12'),
        tripType: 'One-Way',
        image: '/assets/cities/seoul.png'
      },
      {
        flight: flights.find(f => f.flightNumber === 'AA1022')._id,
        startDate: new Date('2025-11-18'),
        endDate: new Date('2025-12-18'),
        tripType: 'Round-Trip',
        image: '/assets/cities/Ho Chi Minh City.png'
      },
      {
        flight: flights.find(f => f.flightNumber === 'AA1023')._id,
        startDate: new Date('2025-11-22'),
        endDate: new Date('2025-12-22'),
        tripType: 'One-Way',
        image: '/assets/cities/tapei.png'
      }
    ]);

    console.log('✅ Popular Flights successfully seeded!');
  } else {
    console.log('🛫 Popular Flights already exist — skipping seeding.');
  }
}

module.exports = seedPopularFlights;
