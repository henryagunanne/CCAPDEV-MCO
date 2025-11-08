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
                passengers: [
                    {
                      fullName: 'Juan Dela Cruz',
                      age: 28,
                      gender: 'Male',
                      passport: 'P1234567',
                      seatNumber: '10A',
                      meal: 'Vegetarian',
                      baggageAllowance: 15
                    },
                    {
                      fullName: 'Bob Johnson',
                      age: 32,
                      gender: 'Male',
                      passport: 'P9876543',
                      seatNumber: '10B',
                      meal: 'Non-Vegetarian',
                      baggageAllowance: 20
                    }
                ],
                bookingDate: new Date('2024-06-01')
            },
            {
                userId: users[1]._id,
                flight: flights.find(f => f.flightNumber === 'AA1002')._id,
                tripType: 'Round-Trip',
                travelClass: 'Economy',
                passengers: [
                    {
                      fullName: 'Maria Santos',
                      age: 45,
                      gender: 'Female',
                      passport: 'P9988776',
                      seatNumber: '14C',
                      meal: 'Gluten-Free',
                      baggageAllowance: 25
                    }
                ],
                bookingDate: new Date('2024-06-02')
            },
            {
                userId: users[1]._id,
                flight: flights.find(f => f.flightNumber === 'AA9001')._id,
                tripType: 'Round-Trip',
                travelClass: 'Economy',
                passengers: [
                    {
                      fullName: 'Maria Santos',
                      age: 45,
                      gender: 'Female',
                      passport: 'P9988776',
                      seatNumber: '14C',
                      meal: 'Gluten-Free',
                      baggageAllowance: 25
                    }
                ],
                bookingDate: new Date('2024-06-02')
            },
            {
                userId: users[2]._id,
                flight: flights.find(f => f.flightNumber === 'AA1003')._id,
                tripType: 'One-Way',
                travelClass: 'Economy',
                passengers: [
                    {
                      fullName: 'Carlos Reyes',
                      age: 39,
                      gender: 'Male',
                      passport: 'P2233445',
                      seatNumber: '3A',
                      meal: 'Vegan',
                      baggageAllowance: 30
                    },
                    {
                      fullName: 'Ella Reyes',
                      age: 35,
                      gender: 'Female',
                      passport: 'P2233446',
                      seatNumber: '3B',
                      meal: 'Vegan',
                      baggageAllowance: 25
                    },
                    {
                      fullName: 'Lucas Reyes',
                      age: 6,
                      gender: 'Male',
                      passport: 'P2233447',
                      seatNumber: '3C',
                      meal: 'Vegetarian',
                      baggageAllowance: 10
                    }
                  ],
                bookingDate: new Date('2024-06-03')
            },
            {
                userId: users[3]._id,
                flight: flights.find(f => f.flightNumber === 'AA1004')._id,
                tripType: 'One-Way',
                travelClass: 'Premium Economy',
                passengers: [
                    {
                        fullName: 'Anna Lopez',
                        age: 48,
                        gender: 'Female',
                        passport: 'P9988777',
                        seatNumber: '14D',
                        meal: 'Non-Vegetarian',
                        baggageAllowance: 30
                    }
                ],
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