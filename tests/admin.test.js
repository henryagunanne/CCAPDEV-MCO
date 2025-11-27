const agent = global.agent;
const User = require('../models/User');

describe("Admin Tasks and Privileges", () => {
    let adminCookie;
   // create admin user before each test
   beforeEach(async () => {
        // Create admin user
        const admin = new User({
            firstName: 'Admin',
            lastName: 'User',
            password: "adminpass123",
            email: "admin@test.com",
            dateOfBirth: new Date(),
            role: "Admin",
        });
        await admin.save(); // save admin user

        // Login admin
        const res = await agent
            .post("/users/login")
            .send({ email: "admin@test.com", password: "adminpass123" });

        adminCookie = res.headers["set-cookie"];
    });


    describe('POST /admin/create', () => {
        // test admin creating flight
        it('Admin can create flight', async () => {
            const res = await agent
                .post('/admin/create')
                .set('Cookie', adminCookie)
                .send({
                    flightNumber: 'AA1001',
                    origin: 'Manila (MNL)',
                    destination: 'Hong Kong (HKG)',
                    departureDate: '2025-11-20',
                    departureTime: '08:30',
                    arrivalTime: '10:45',
                    aircraft: 'Airbus A321',
                    seatCapacity: 180,
                    price: 148,
                    status: 'Scheduled'
                });
    
            expect(res.statusCode).toEqual(201);
            expect(res.body).toHaveProperty('message', 'Flight created successfully.');
        });

        // test normal user creating flight
        it('Normal user cannot create flight', async () => {
            const user = new User({
                firstName: 'Test',
                lastName: 'User',
                email: 'test@example.com',
                password: 'password123',
                dateOfBirth: new Date()
            });
            await user.save();

            const login = await agent
                .post("/users/login")
                .send({ email: 'test@example.com', password: 'password123' });

            const userCookie = login.headers["set-cookie"];

            const res = await agent
                .post('/admin/create')
                .set('Cookie', userCookie)
                .send({
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
            expect(res.statusCode).toEqual(403);
            expect(res.body).toHaveProperty('title', 'Access Denied')
        });
    });

    

});