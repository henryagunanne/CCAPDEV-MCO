// seeds/seedReservations.js
const Flight = require('../models/Flight');
const User = require('../models/User');
const Reservation = require('../models/Reservation');

async function seedReservations() {
  const count = await Reservation.countDocuments();

  if (count === 0) {
    console.log('Seeding Reservations collection...');

    // Get users from the database
    const users = await User.find({ role: 'User' });

    // Get flights from the database
    const flights = await Flight.find({
      flightNumber: {
        $in: [
          'AA1033', 'AA1036', 'AA1013', 'AA1005',
          'AA1029', 'AA1052', 'AA1056', 'AA1064',
          'AA1076', 'AA1089', 'AA1320', 'AA1205',
        ]
      }
    });

    const getFlightId = (num) => {
      const f = flights.find(f => f.flightNumber === num);
      return f ? f._id : null;
    };

    const reservations = [
      {
        userId: users[0]._id,
        bookingReference: 'AAR1033',
        flight: [getFlightId('AA1033')],
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
        bookingDate: new Date('2025-11-01'),
        status: 'Confirmed'
      },
      {
        userId: users[1]._id,
        bookingReference: 'AAQDE00',
        flight: [getFlightId('AA1320'), getFlightId('AA1205')],
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
        bookingDate: new Date('2025-10-30'),
        status: 'Confirmed'
      },
      {
        userId: users[3]._id,
        bookingReference: 'AAQDEBFY',
        flight: [getFlightId('AA1013')],
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
        bookingDate: new Date('2025-10-25'),
        status: 'Confirmed'
      },
      {
        userId: users[3]._id,
        bookingReference: 'AAQ1029',
        flight: [getFlightId('AA1005'), getFlightId('AA1029')],
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
        bookingDate: new Date('2025-10-20'),
        status: 'Confirmed'
      },
      {
        userId: users[2]._id,
        bookingReference: 'AAQ105Y',
        flight: [getFlightId('AA1052')],
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
        bookingDate: new Date('2025-10-27'),
        status: 'Confirmed'
      },
      {
        userId: users[1]._id,
        bookingReference: 'AAWE456',
        flight: [getFlightId('AA1056'), getFlightId('AA1064')],
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
        bookingDate: new Date('2025-11-02'),
        status: 'Confirmed'
      },
      {
        userId: users[0]._id,
        bookingReference: 'AART102',
        flight: [getFlightId('AA1076')],
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
        bookingDate: new Date('2025-11-05'),
        status: 'Confirmed'
      },
      {
        userId: users[3]._id,
        bookingReference: 'AA4RJNM1',
        flight: [getFlightId('AA1089')],
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
        bookingDate: new Date('2025-11-03'),
        status: 'Confirmed'
      },
      {
        userId: users[1]._id,
        bookingReference: 'AA334KFF',
        flight: [getFlightId('AA2015')],
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
        bookingDate: new Date('2025-10-29'),
        status: 'Confirmed'
      }
    ].filter(r => r.flight.every(f => f)); // only include those with valid flight IDs

    await Reservation.insertMany(reservations);
    console.log('Reservations collection seeded successfully.');
  } else {
    console.log('Reservations collection already has data. Skipping seeding.');
  }
}

module.exports = seedReservations;
