const Flight = require('../models/Flight');
const User = require('../models/User');
const Reservation = require('../models/Reservation');

async function seedReservations() {
    const count = await Reservation.countDocuments();

    if (count === 0) {
        console.log('🌱 Seeding Reservations collection...');

        // Get users from the database
        const users = await User.find({role: 'User'});

        // Get flights from the database
        const flights = await Flight.find({
            flightNumber: { $in: [
              'AA1001', 'AA1002', 'AA1003', 'AA1004',
              'AA9001', 'AA1021', 'AA1022', 'AA1023',
              'AA1005', 'AA1020', 'AA2010', 'AA1009'
            ]}
        });

        await Reservation.insertMany([
            {
                userId: users[0]._id,
                flight: flights.find(f => f.flightNumber === 'AA1001')._id,
                tripType: 'One-Way',
                travelClass: 'Economy',
                seatNumber: '10A',
                meal: 'Vegetarian',
                passport: 'X1234567',
                passengers: 1,
                bookingDate: new Date('2024-06-01')
            },
            {
                userId: users[1]._id,
                flight: flights.find(f => f.flightNumber === 'AA1002')._id,
                tripType: 'Round-Trip',
                travelClass: 'Economy',
                seatNumber: '8B',
                passport: 'Y7654321',
                meal: 'Non-Vegetarian',
                passengers: 1,
                bookingDate: new Date('2024-06-02')
            },
            {
                userId: users[1]._id,
                flight: flights.find(f => f.flightNumber === 'AA9001')._id,
                tripType: 'Round-Trip',
                travelClass: 'Economy',
                seatNumber: '10D',
                passport: 'Y7654321',
                meal: 'Non-Vegetarian',
                passengers: 1,
                bookingDate: new Date('2024-06-02')
            },
            {
                userId: users[2]._id,
                flight: flights.find(f => f.flightNumber === 'AA1003')._id,
                tripType: 'One-Way',
                travelClass: 'Economy',
                seatNumber: '10C',
                passport: 'Z9876543',
                meal: 'Vegan',
                passengers: 2,
                bookingDate: new Date('2024-06-03')
            },
            {
                userId: users[3]._id,
                flight: flights.find(f => f.flightNumber === 'AA1004')._id,
                tripType: 'One-Way',
                travelClass: 'Premium Economy',
                seatNumber: '9D',
                passport: 'W1234987',
                meal: 'Gluten-Free',
                passengers: 1,
                baggageAllowance: 20,
                bookingDate: new Date('2024-06-04'),
                status: 'Confirmed'
            }
        ]);

        console.log('✅ Reseservations collection seeded successfully.');
    }else {
        console.log('ℹ️ Reservations collection already has data. Skipping seeding.');
    }
}

module.exports = seedReservations;