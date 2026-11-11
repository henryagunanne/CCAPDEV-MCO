const Flight = require('../models/Flight');
const User = require('../models/User');
const Reservation = require('../models/Reservation');

async function seedReservations() {
  const count = await Reservation.countDocuments();

  if (count > 0) {
    console.log('Reservations collection already has data. Skipping seeding.');
    return;
  }

  console.log('Seeding Reservations collection...');

  // These are the accounts created by seedUsers.js. Do not create or modify users here.
  const users = await User.find({ role: 'User' }).sort({ _id: 1 });

  if (users.length < 4) {
    console.log(`Expected 4 seeded regular users, but found ${users.length}. Seed Users first.`);
    return;
  }

  // Resolve every reservation to an actual Flight document already in MongoDB.
  const preferredFlightNumbers = [
    'AA1033', 'AA1320', 'AA1205', 'AA1013', 'AA1005',
    'AA1029', 'AA1052', 'AA1056', 'AA1064', 'AA1076',
    'AA1089', 'AA1036', 'AA2000'
  ];

  const flights = await Flight.find({}).sort({ flightNumber: 1 });

  if (flights.length === 0) {
    console.log('No flight records found. Seed Flights before Reservations.');
    return;
  }

  const getFlightId = (flightNumber, fallbackIndex) => {
    const preferred = flights.find(f => f.flightNumber === flightNumber);
    const fallback = flights[fallbackIndex % flights.length];
    return (preferred || fallback)?._id || null;
  };

  // Preserve the original reservation details. Only flight references are
  // resolved against existing Flight records, with a fallback for newly seeded
  // AA2000+ records when the legacy AA10xx flight numbers are absent.
  const reservations = [
    {
      userId: users[0]._id,
      bookingReference: 'AAR1033',
      flight: [getFlightId('AA1033', 0)],
      tripType: 'One-Way',
      travelClass: 'Economy',
      passengers: [
        {
          fullName: 'Miguel Santos',
          age: 32,
          gender: 'Male',
          passport: 'P100001',
          seatNumber: '12A',
          meal: 'Non-Vegetarian',
          baggageAllowance: 20
        }
      ],
      price: 2500,
      bookingDate: new Date('2026-11-01'),
      status: 'Confirmed'
    },
    {
      userId: users[1]._id,
      bookingReference: 'AAQDE00',
      flight: [getFlightId('AA1320', 1), getFlightId('AA1205', 2)],
      tripType: 'Round-Trip',
      travelClass: 'Economy',
      passengers: [
        {
          fullName: 'Anna Rivera',
          age: 29,
          gender: 'Female',
          passport: 'P100002',
          seatNumber: '7C',
          meal: 'Vegan',
          baggageAllowance: 25
        },
        {
          fullName: 'Luis Rivera',
          age: 30,
          gender: 'Male',
          passport: 'P100003',
          seatNumber: '7D',
          meal: 'Vegetarian',
          baggageAllowance: 25
        }
      ],
      price: 5200,
      bookingDate: new Date('2026-10-30'),
      status: 'Confirmed'
    },
    {
      userId: users[3]._id,
      bookingReference: 'AAQDEBFY',
      flight: [getFlightId('AA1013', 3)],
      tripType: 'One-Way',
      travelClass: 'Premium Economy',
      passengers: [
        {
          fullName: 'Takeshi Mori',
          age: 45,
          gender: 'Male',
          passport: 'J123456',
          seatNumber: '2A',
          meal: 'Vegetarian',
          baggageAllowance: 30
        }
      ],
      price: 4100,
      bookingDate: new Date('2026-10-25'),
      status: 'Confirmed'
    },
    {
      userId: users[3]._id,
      bookingReference: 'AAQ1029',
      flight: [getFlightId('AA1005', 4), getFlightId('AA1029', 5)],
      tripType: 'Round-Trip',
      travelClass: 'First',
      passengers: [
        {
          fullName: 'Carla Lim',
          age: 38,
          gender: 'Female',
          passport: 'P100004',
          seatNumber: '1A',
          meal: 'Vegan',
          baggageAllowance: 40
        },
        {
          fullName: 'Adrian Lim',
          age: 40,
          gender: 'Male',
          passport: 'P100005',
          seatNumber: '1B',
          meal: 'Non-Vegetarian',
          baggageAllowance: 40
        }
      ],
      price: 9800,
      bookingDate: new Date('2026-10-20'),
      status: 'Confirmed'
    },
    {
      userId: users[2]._id,
      bookingReference: 'AAQ105Y',
      flight: [getFlightId('AA1052', 6)],
      tripType: 'One-Way',
      travelClass: 'Business',
      passengers: [
        {
          fullName: 'Nguyen Thi Hoa',
          age: 27,
          gender: 'Female',
          passport: 'V200001',
          seatNumber: '4B',
          meal: 'Vegetarian',
          baggageAllowance: 35
        }
      ],
      price: 5800,
      bookingDate: new Date('2026-10-27'),
      status: 'Confirmed'
    },
    {
      userId: users[1]._id,
      bookingReference: 'AAWE456',
      flight: [getFlightId('AA1056', 7), getFlightId('AA1064', 8)],
      tripType: 'Round-Trip',
      travelClass: 'Economy',
      passengers: [
        {
          fullName: 'David Chou',
          age: 34,
          gender: 'Male',
          passport: 'C400010',
          seatNumber: '14F',
          meal: 'Gluten-Free',
          baggageAllowance: 20
        }
      ],
      price: 2700,
      bookingDate: new Date('2026-11-02'),
      status: 'Confirmed'
    },
    {
      userId: users[0]._id,
      bookingReference: 'AART102',
      flight: [getFlightId('AA1076', 9)],
      tripType: 'One-Way',
      travelClass: 'Economy',
      passengers: [
        {
          fullName: 'Kim Ji-won',
          age: 26,
          gender: 'Female',
          passport: 'K900002',
          seatNumber: '18B',
          meal: 'Vegan',
          baggageAllowance: 15
        }
      ],
      price: 2300,
      bookingDate: new Date('2026-11-05'),
      status: 'Confirmed'
    },
    {
      userId: users[3]._id,
      bookingReference: 'AA4RJNM1',
      flight: [getFlightId('AA1089', 10)],
      tripType: 'One-Way',
      travelClass: 'Business',
      passengers: [
        {
          fullName: 'John Smith',
          age: 52,
          gender: 'Male',
          passport: 'UK500011',
          seatNumber: '3C',
          meal: 'Non-Vegetarian',
          baggageAllowance: 40
        }
      ],
      price: 6500,
      bookingDate: new Date('2026-11-03'),
      status: 'Confirmed'
    },
    {
      userId: users[1]._id,
      bookingReference: 'AA334KFF',
      flight: [getFlightId('AA2015', 11)],
      tripType: 'One-Way',
      travelClass: 'Economy',
      passengers: [
        {
          fullName: 'Aisha Rahman',
          age: 31,
          gender: 'Female',
          passport: 'M300022',
          seatNumber: '19A',
          meal: 'Vegetarian',
          baggageAllowance: 25
        }
      ],
      price: 2400,
      bookingDate: new Date('2026-10-29'),
      status: 'Confirmed'
    }
  ];

  // Every entry must point to an existing flight. Remove any null references
  // defensively before inserting.
  const validReservations = reservations
    .map(reservation => ({
      ...reservation,
      flight: reservation.flight.filter(Boolean)
    }))
    .filter(reservation => reservation.flight.length > 0);

  await Reservation.insertMany(validReservations);
  console.log(`Reservations collection seeded successfully (${validReservations.length} records).`);
}

module.exports = seedReservations;
