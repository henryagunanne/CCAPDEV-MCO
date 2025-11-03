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
                travelClass: 'Economy',
                tripType: 'One-Way',
                seatNumber: '10A',
                meal: 'Vegetarian',
                passengers: 1,
                bookingDate: new Date('2024-06-01')
            },
            {
                userId: users[1]._id,
                flight: flights.find(f => f.flightNumber === 'AA1002')._id,
                travelClass: 'Economy',
                tripType: 'Round-Trip',
                seatNumber: '8B',
                meal: 'Non-Vegetarian',
                passengers: 1,
                bookingDate: new Date('2024-06-02')
            },
            {
                userId: users[1]._id,
                flight: flights.find(f => f.flightNumber === 'AA9001')._id,
                travelClass: 'Economy',
                tripType: 'Round-Trip',
                seatNumber: '10D',
                meal: 'Non-Vegetarian',
                passengers: 1,
                bookingDate: new Date('2024-06-02')
            },
            {
                userId: users[2]._id,
                flight: flights.find(f => f.flightNumber === 'AA1003')._id,
                travelClass: 'Economy',
                tripType: 'One-Way',
                seatNumber: '10C',
                meal: 'Vegan',
                passengers: 2,
                bookingDate: new Date('2024-06-03')
            },
            {
                userId: users[3]._id,
                flight: flights.find(f => f.flightNumber === 'AA1004')._id,
                travelClass: 'Premium Economy',
                tripType: 'One-Way',
                seatNumber: '9D',
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