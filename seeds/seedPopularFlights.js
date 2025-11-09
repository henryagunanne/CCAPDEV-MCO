const PopularFlight = require('../models/popularFlight'); // ✅ lowercase
const Flight = require('../models/Flight');

async function seedPopularFlights() {
  const count = await PopularFlight.countDocuments();

  if (count === 0) {
    console.log('🌱 Seeding Popular Flights collection...');

    // Fetch flights that match your seed criteria
    const flights = await Flight.find({
      flightNumber: { $in: [
        'AA1001', 'AA1002', 'AA1003', 'AA1004',
        'AA2015', 'AA1021', 'AA1022', 'AA1023',
        'AA1005', 'AA1020', 'AA2010', 'AA1009'
      ]}
    }).lean(); // ✅ lean() for faster access

    if (flights.length === 0) {
      console.log('⚠️ No matching flights found in the Flight collection.');
      return;
    }

    await PopularFlight.insertMany([
      {
        flight: flights.find(f => f.flightNumber === 'AA1001')._id,
        startDate: new Date('2025-11-10'),
        endDate: new Date('2025-12-10'),
        travelClass: 'Economy',
        tripType: 'One-Way',
        image: '/assets/cities/hongkong.png'
      },
      {
        flight: flights.find(f => f.flightNumber === 'AA1002')._id,
        startDate: new Date('2025-11-15'),
        endDate: new Date('2025-12-15'),
        travelClass: 'Economy',
        tripType: 'Round-Trip',
        image: '/assets/cities/singapore.png'
      },
      {
        flight: flights.find(f => f.flightNumber === 'AA1003')._id,
        startDate: new Date('2025-11-20'),
        endDate: new Date('2025-12-20'),
        travelClass: 'Economy',
        tripType: 'One-Way',
        image: '/assets/cities/thailand.png'
      },
      {
        flight: flights.find(f => f.flightNumber === 'AA1004')._id,
        startDate: new Date('2025-11-25'),
        endDate: new Date('2025-12-25'),
        travelClass: 'Premium Economy',
        tripType: 'One-Way',
        image: '/assets/cities/tokyo.png'
      },
      {
        flight: flights.find(f => f.flightNumber === 'AA2015')._id,
        startDate: new Date('2025-11-05'),
        endDate: new Date('2025-12-05'),
        travelClass: 'Economy',
        tripType: 'Round-Trip',
        image: '/assets/cities/Malaysia.png'
      },
      {
        flight: flights.find(f => f.flightNumber === 'AA1021')._id,
        startDate: new Date('2025-11-12'),
        endDate: new Date('2025-12-12'),
        travelClass: 'Economy',
        tripType: 'One-Way',
        image: '/assets/cities/seoul.png'
      },
      {
        flight: flights.find(f => f.flightNumber === 'AA1022')._id,
        startDate: new Date('2025-11-18'),
        endDate: new Date('2025-12-18'),
        travelClass: 'Economy',
        tripType: 'Round-Trip',
        image: '/assets/cities/Ho Chi Minh City.png'
      },
      {
        flight: flights.find(f => f.flightNumber === 'AA1023')._id,
        startDate: new Date('2025-11-22'),
        endDate: new Date('2025-12-22'),
        travelClass: 'Economy',
        tripType: 'One-Way',
        image: '/assets/cities/tapei.png'
      },
      {
        flight: flights.find(f => f.flightNumber === 'AA1005')._id,
        startDate: new Date('2025-11-11'),
        endDate: new Date('2025-12-15'),
        travelClass: 'Business',
        tripType: 'Round-Trip',
        image: '/assets/cities/hanoi.png'
      },
      {
        flight: flights.find(f => f.flightNumber === 'AA1020')._id,
        startDate: new Date('2025-11-22'),
        endDate: new Date('2025-12-01'),
        travelClass: 'Business',
        tripType: 'One-Way',
        image: '/assets/cities/australia.jpg'
      },
      {
        flight: flights.find(f => f.flightNumber === 'AA2010')._id,
        startDate: new Date('2025-11-30'),
        endDate: new Date('2025-12-18'),
        travelClass: 'First',
        tripType: 'Round-Trip',
        image: '/assets/cities/davao.jpg'
      },
      {
        flight: flights.find(f => f.flightNumber === 'AA1009')._id,
        startDate: new Date('2025-11-29'),
        endDate: new Date('2025-12-09'),
        travelClass: 'Economy',
        tripType: 'One-Way',
        image: '/assets/cities/shanghai.jpg'
      }
    ]);

    console.log('✅ Popular Flights successfully seeded!');
  } else {
    console.log('🛫 Popular Flights already exist — skipping seeding.');
  }
}

module.exports = seedPopularFlights;
