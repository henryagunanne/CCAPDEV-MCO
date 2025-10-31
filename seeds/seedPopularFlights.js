const PopularFlight = require('../models/popularFlight');

async function seedPopularFlights() {
  const count = await PopularFlight.countDocuments();

  if (count === 0) {
    console.log('🌱 Seeding Popular Flights collection...');

    await PopularFlight.insertMany([
      {
        flightNumber: 'AA1001',
        origin: 'Manila (MNL)',
        destination: 'Hong Kong (HKG)',
        startDate: new Date('2025-10-20'),
        endDate: new Date('2025-10-24'),
        price: 148,
        tripType: 'Round-trip',
        travelClass: 'Economy',
        departureDate: new Date('2025-10-25'),
        image: '/assets/cities/hongkong.png',
      },
      {
        flightNumber: 'AA1002',
        origin: 'Manila (MNL)',
        destination: 'Singapore (SIN)',
        startDate: new Date('2025-10-20'),
        endDate: new Date('2025-10-24'),
        price: 99,
        tripType: 'One-way',
        travelClass: 'Economy',
        departureDate: new Date('2025-10-25'),
        image: '/assets/cities/singapore.png',
      },
      {
        flightNumber: 'AA1003',
        origin: 'Manila (MNL)',
        destination: 'Bangkok (BKK)',
        startDate: new Date('2025-10-25'),
        endDate: new Date('2025-10-30'),
        price: 188,
        tripType: 'Round-trip',
        travelClass: 'Economy',
        departureDate: new Date('2025-10-31'),
        image: '/assets/cities/thailand.png',
      },
      {
        flightNumber: 'AA1004',
        origin: 'Manila (MNL)',
        destination: 'Tokyo (HND)',
        startDate: new Date('2025-10-25'),
        endDate: new Date('2025-10-29'),
        price: 200,
        tripType: 'Round-trip',
        travelClass: 'Premium Economy',
        departureDate: new Date('2025-10-30'),
        image: '/assets/cities/tokyo.png',
      },
      {
        flightNumber: 'AA1005',
        origin: 'Manila (MNL)',
        destination: 'Sydney (SYD)',
        startDate: new Date('2025-11-01'),
        endDate: new Date('2025-11-08'),
        price: 350,
        tripType: 'Round-trip',
        travelClass: 'Business',
        departureDate: new Date('2025-11-09'),
        image: '/assets/cities/australia.png',
      },
      {
        flightNumber: 'AA1006',
        origin: 'Manila (MNL)',
        destination: 'Seoul (ICN)',
        startDate: new Date('2025-10-30'),
        endDate: new Date('2025-11-02'),
        price: 175,
        tripType: 'Round-trip',
        travelClass: 'Economy',
        departureDate: new Date('2025-11-03'),
        image: '/assets/cities/seoul.png',
      }
    ]);

    console.log('✅ Popular Flights successfully seeded!');
  } else {
    console.log('🛫 Popular Flights already exist — skipping seeding.');
  }
}

module.exports = seedPopularFlights;
