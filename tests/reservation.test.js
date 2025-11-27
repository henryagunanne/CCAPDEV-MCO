const agent = global.agent;
const Reservation = require('../models/Reservation');
const Flight = require('../models/Flight');
const User = require('../models/User');

describe('Booking Flight Tests', () => {
    let userCookie;
    let flightId;
    let userId;
    // create user, login and create flight before each tests
    beforeEach(async () => {
        // create user
        const resUser = new User({
            firstName: 'Test',
            lastName: 'User',
            email: 'test@example.com',
            password: 'password123',
            dateOfBirth: new Date()
        });
        await resUser.save();   // save user
        userId = resUser._id.toString();

        // login user
        const resLogin = await agent
        .post('/users/login')
        .send({ 
            email: 'test@example.com',
            password: 'password123'
        });

        userCookie = resLogin.headers["set-cookie"];

        //create flight
        const flight = await Flight.create({
            flightNumber: 'AA1002',
            origin: 'Manila (MNL)',
            destination: 'Hong Kong (HKG)',
            departureDate: '2025-12-20',
            departureTime: '08:30',
            arrivalTime: '10:45',
            aircraft: 'Airbus A321',
            seatCapacity: 180,
            price: 148,
            status: 'Scheduled'
        });
        flightId = flight._id.toString();
    })

    // create new booking/reservation
    describe('POST /reservations/create', () => {
        it('should create reservation', async () => {
            const res = await agent 
                .post('/reservations/create')
                .set('Cookie', userCookie)
                .send({
                    flight: flightId,
                    tripType: 'One-Way',
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
                    totalAmount: 5200
                });

            expect(res.statusCode).toEqual(200);
            expect(res.body.redirect).toMatch(/\/reservations\/.*\/confirmation/);
        });
    });

    // edit booking test
    describe('POST /reservations/:id/edit', () => {
        it('should edit the booking details', async () => {
            let resId;
            // first create a booking
            const reservation = await Reservation.create({
                userId: userId,
                flight: flightId,
                tripType: 'One-Way',
                travelClass: 'First',
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
                price: 6650
            });

            resId = reservation._id.toString();

            // edit reservation details
            const res = await agent
                .post(`/reservations/${resId}/edit`)
                .set('Cookie', userCookie)
                .send({
                    passengersJSON: [
                        {
                            fullName: 'Takeshi Mori',
                            age: 45,
                            gender: 'Male',
                            passport: 'PP123456',
                            seatNumber: '2A',
                            meal: 'None',
                            baggageAllowance: 0
                        }
                    ],
                    totalPrice: 5000
                });
            
            expect(res.statusCode).toEqual(200);
        });
    });

    // cancel flight test
    describe('POST /reservations/cancel/:reservationId', () => {
        it('should set the status of the reservation to Cancelled', async () => {
            let resId;
            // first create a booking
            const reservation = await Reservation.create({
                userId: userId,
                flight: flightId,
                tripType: 'One-Way',
                travelClass: 'First',
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
                price: 6650,
                status: 'Confirmed'
            });

            resId = reservation._id.toString(); 

            const res = await agent 
                .post(`/reservations/cancel/${resId}`)
                .set('Cookie', userCookie);

            expect(res.statusCode).toEqual(200);
            expect(res.body).toHaveProperty('success', true);
            expect(res.body.message).toBe('Reservation Cancelled');
        }); 
    });

})