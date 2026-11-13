const request = require('supertest');
const app = require('../server'); // Import the Express app
const User = require('../models/User');

let agent; 
let csrfToken;

async function refreshCsrfToken() {
    const response = await agent.get('/');
    const match = response.text.match(/<meta name="csrf-token" content="([^"]+)"/);
    if (!match) throw new Error('CSRF token was not rendered.');
    csrfToken = match[1];
}

describe("Admin Tasks and Privileges", () => {

    beforeAll(async () => {
        agent = request.agent(app);
    });

    beforeEach(async () => {
        await refreshCsrfToken();
    });


    describe('POST /admin/create', () => {
        // test admin creating flight
        it('Admin can create flight', async () => {
            // Create admin user
            const admin = new User({
                firstName: 'Admin',
                lastName: 'User',
                password: "adminpass123",
                email: "admin@test.com",
                dateOfBirth: new Date(),
                role: "Admin",
                roles: ['flight_operations_admin'],
                permissions: ['flight:read', 'flight:create', 'flight:update', 'flight:delete']
            });
            await admin.save(); // save admin user

            // Login admin
            await agent
                .post("/users/login")
                .set('x-csrf-token', csrfToken)
                .send({ email: "admin@test.com", password: "adminpass123" });
            await refreshCsrfToken();


            const res = await agent
                .post('/admin/create')
                .set('x-csrf-token', csrfToken)
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
            // create user
            const user = new User({
                firstName: 'Test',
                lastName: 'User',
                email: 'test@example.com',
                password: 'password123',
                dateOfBirth: new Date()
            });
            await user.save();  // save user

            // login user
            await agent
                .post("/users/login")
                .set('x-csrf-token', csrfToken)
                .send({ email: 'test@example.com', password: 'password123' });
            await refreshCsrfToken();


            const res = await agent
                .post('/admin/create')
                .set('x-csrf-token', csrfToken)
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
            expect(res.text).toMatch(/<title>Access Denied<\/title>/);
        });
    });

    describe('Sensitive admin actions and approvals', () => {
        it('redirects browser page requests to the pending MFA screen', async () => {
            const admin = new User({
                firstName: 'MFA',
                lastName: 'Admin',
                password: 'mfaadmin123',
                email: 'mfa-page@test.com',
                dateOfBirth: new Date(),
                role: 'Admin',
                roles: ['flight_operations_admin'],
                permissions: ['flight:read'],
                mfaEnabled: true,
                mfaVerified: false,
                mfaSecret: 'encrypted-test-secret',
                status: 'active'
            });
            await admin.save();

            await agent
                .post('/users/login')
                .set('x-csrf-token', csrfToken)
                .send({ email: 'mfa-page@test.com', password: 'mfaadmin123' });

            const res = await agent
                .get('/admin')
                .set('Accept', 'text/html');

            expect(res.statusCode).toBe(302);
            expect(res.headers.location).toBe('/users/mfa/verify');
        });

        it('preserves the MFA_REQUIRED JSON response for API requests', async () => {
            const admin = new User({
                firstName: 'MFA',
                lastName: 'API',
                password: 'mfaadmin123',
                email: 'mfa-api@test.com',
                dateOfBirth: new Date(),
                role: 'Admin',
                roles: ['flight_operations_admin'],
                permissions: ['flight:read'],
                mfaEnabled: true,
                mfaVerified: false,
                mfaSecret: 'encrypted-test-secret',
                status: 'active'
            });
            await admin.save();

            await agent
                .post('/users/login')
                .set('x-csrf-token', csrfToken)
                .send({ email: 'mfa-api@test.com', password: 'mfaadmin123' });

            const res = await agent
                .get('/admin')
                .set('Accept', 'application/json');

            expect(res.statusCode).toBe(403);
            expect(res.body).toMatchObject({
                success: false,
                code: 'MFA_REQUIRED'
            });
        });

        it('renders a not-found page for browser navigation', async () => {
            const res = await agent
                .get('/missing-page')
                .set('Accept', 'text/html');

            expect(res.statusCode).toBe(404);
            expect(res.text).toMatch(/<title>404 Not Found<\/title>/);
            expect(res.text).toContain('/missing-page');
        });

        it('returns a structured not-found response to API requests', async () => {
            const res = await agent
                .get('/missing-api')
                .set('Accept', 'application/json');

            expect(res.statusCode).toBe(404);
            expect(res.body).toMatchObject({
                success: false,
                code: 'NOT_FOUND'
            });
        });

        it('Sensitive admin routes require step-up authentication', async () => {
            const admin = new User({
                firstName: 'Step',
                lastName: 'Up',
                password: 'stepupadmin123',
                email: 'stepup@test.com',
                dateOfBirth: new Date(),
                role: 'Admin',
                roles: ['flight_operations_admin'],
                permissions: ['flight:read', 'flight:update'],
                mfaEnabled: true,
                mfaVerified: true,
                status: 'active'
            });
            await admin.save();

            await agent
                .post('/users/login')
                .set('x-csrf-token', csrfToken)
                .send({ email: 'stepup@test.com', password: 'stepupadmin123' });
            await refreshCsrfToken();

            const res = await agent
                .post('/admin/sensitive-test')
                .set('x-csrf-token', csrfToken)
                .send({});

            expect(res.statusCode).toEqual(403);
            expect(res.body.code).toBe('STEP_UP_REQUIRED');
        });
    });

});