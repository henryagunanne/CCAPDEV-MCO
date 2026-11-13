const request = require('supertest');
const app = require('../server'); // Import the Express app
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const Flight = require('../models/Flight');
const AircraftLayout = require('../models/AircraftLayout');
const Reservation = require('../models/Reservation');
const speakeasy = require('speakeasy');
const {
    decryptSecret,
    encryptSecret,
    generateSecret,
    hashRecoveryCode,
    verifyTokenCounter
} = require('../services/mfa');

let agent; 
let csrfToken;

async function refreshCsrfToken() {
    const response = await agent.get('/');
    const match = response.text.match(/<meta name="csrf-token" content="([^"]+)"/);
    if (!match) throw new Error('CSRF token was not rendered.');
    csrfToken = match[1];
    return csrfToken;
}

async function signInAdmin(email, password) {
    const loginCsrf = await refreshCsrfToken();
    const login = await agent
        .post('/users/login')
        .set('Accept', 'text/html')
        .set('x-csrf-token', loginCsrf)
        .send({ email, password });
    expect(login.statusCode).toBe(302);
    expect(login.headers.location).toMatch(/^\/users\/mfa\/(enroll|verify)$/);

    const page = await agent.get(login.headers.location).set('Accept', 'text/html');
    expect(page.statusCode).toBe(200);
    const account = await User.findOne({ email });
    const secret = login.headers.location.endsWith('/enroll')
        ? decryptSecret(account.mfaPendingSecret)
        : decryptSecret(account.mfaSecret);
    const token = speakeasy.totp({ secret, encoding: 'base32', digits: 6, step: 30 });
    const pageCsrf = page.text.match(/<meta name="csrf-token" content="([^"]+)"/);
    expect(pageCsrf).not.toBeNull();

    await agent
        .post(login.headers.location.endsWith('/enroll') ? '/users/mfa/setup/confirm' : '/users/mfa/verify')
        .set('x-csrf-token', pageCsrf[1])
        .send({ token })
        .expect(200);
    await refreshCsrfToken();
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
            await signInAdmin('admin@test.com', 'adminpass123');


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
            expect(res.body.flight.aircraftLayoutId).toBeTruthy();
            const savedLayout = await AircraftLayout.findById(res.body.flight.aircraftLayoutId).lean();
            expect(savedLayout.seatCapacity).toBe(180);
            expect(savedLayout.seats.slice(0, 10).map(seat => seat.seatNumber)).toEqual(
                ['1A', '1B', '1C', '1D', '1E', '1F', '1G', '1H', '1I', '1J']
            );
        });

        it('rejects aircraft or capacity changes when reservations already reference the flight', async () => {
            const admin = new User({
                firstName: 'Update', lastName: 'Admin', password: 'adminpass123',
                email: 'flight-update-admin@test.com', role: 'Admin',
                roles: ['flight_operations_admin'],
                permissions: ['flight:read', 'flight:create', 'flight:update']
            });
            await admin.save();
            await signInAdmin('flight-update-admin@test.com', 'adminpass123');
            const created = await agent.post('/admin/create').set('x-csrf-token', csrfToken).send({
                flightNumber: 'AA1991', origin: 'Manila (MNL)', destination: 'Cebu (CEB)',
                departureDate: '2027-01-15', departureTime: '08:00', arrivalTime: '09:30',
                aircraft: 'Airbus A320', seatCapacity: 100, price: 2000, status: 'Scheduled'
            }).expect(201);
            await Reservation.create({
                bookingReference: 'TEST-LOCKED-FLIGHT',
                flight: [created.body.flight._id],
                tripType: 'One-Way', travelClass: 'Economy',
                passengers: [{ fullName: 'Booked Passenger', seatNumber: '1A' }],
                price: 2000
            });
            await agent.put(`/admin/update/${created.body.flight._id}`)
                .set('x-csrf-token', csrfToken)
                .send({
                    flightNumber: 'AA1991', origin: 'Manila (MNL)', destination: 'Cebu (CEB)',
                    departureDate: '2027-01-15', departureTime: '08:00', arrivalTime: '09:30',
                    aircraft: 'Airbus A320', seatCapacity: 110, price: 2000, status: 'Scheduled'
                }).expect(409);
            const unchanged = await Flight.findById(created.body.flight._id).lean();
            expect(unchanged.seatCapacity).toBe(100);
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
        it('executes the MFA enrollment script and accepts a valid authenticator code', async () => {
            const admin = new User({
                firstName: 'Enroll',
                lastName: 'Admin',
                password: 'mfaenroll123',
                email: 'mfa-enroll@test.com',
                dateOfBirth: new Date(),
                role: 'Admin',
                roles: ['flight_operations_admin'],
                permissions: ['flight:read'],
                status: 'active'
            });
            await admin.save();

            await agent
                .post('/users/login')
                .set('x-csrf-token', csrfToken)
                .send({ email: 'mfa-enroll@test.com', password: 'mfaenroll123' });

            const enrollPage = await agent
                .get('/users/mfa/enroll')
                .set('Accept', 'text/html');
            expect(enrollPage.statusCode).toBe(200);
            expect(enrollPage.text).toMatch(/<script nonce="[^"]+">/);

            const enrolledAdmin = await User.findById(admin._id);
            const secret = decryptSecret(enrolledAdmin.mfaPendingSecret);
            const token = speakeasy.totp({
                secret,
                encoding: 'base32',
                digits: 6,
                step: 30
            });
            const csrfMatch = enrollPage.text.match(/<meta name="csrf-token" content="([^"]+)"/);
            expect(csrfMatch).not.toBeNull();

            const confirmation = await agent
                .post('/users/mfa/setup/confirm')
                .set('x-csrf-token', csrfMatch[1])
                .send({ token });

            expect(confirmation.statusCode).toBe(200);
            expect(confirmation.body).toMatchObject({
                success: true,
                redirect: '/admin'
            });
            const confirmedAdmin = await User.findById(admin._id);
            expect(confirmedAdmin.mfaEnabled).toBe(true);
            expect(confirmedAdmin.mfaVerified).toBe(false);
            expect(confirmedAdmin.recoveryCodes).toHaveLength(10);
        });

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

        it('requires fresh MFA on every administrator login even when the legacy flag is true', async () => {
            const secret = generateSecret();
            const admin = await User.create({
                firstName: 'Repeat',
                lastName: 'Admin',
                password: 'repeatadmin123',
                email: 'repeat-mfa@test.com',
                role: 'Admin',
                roles: ['flight_operations_admin'],
                mfaEnabled: true,
                mfaVerified: true,
                mfaSecret: encryptSecret(secret),
                status: 'active'
            });

            const firstLogin = await agent.post('/users/login')
                .set('Accept', 'text/html')
                .set('x-csrf-token', csrfToken)
                .send({ email: admin.email, password: 'repeatadmin123' })
                .expect(302);
            expect(firstLogin.headers.location).toBe('/users/mfa/verify');
            const firstBlocked = await agent.get('/admin').set('Accept', 'text/html').expect(302);
            expect(firstBlocked.headers.location).toBe('/users/mfa/verify');

            const verifyPage = await agent.get('/users/mfa/verify').expect(200);
            const pageCsrf = verifyPage.text.match(/<meta name="csrf-token" content="([^"]+)"/);
            const token = speakeasy.totp({ secret, encoding: 'base32', digits: 6, step: 30 });
            await agent.post('/users/mfa/verify')
                .set('x-csrf-token', pageCsrf[1])
                .send({ token })
                .expect(200);
            await agent.get('/admin').expect(200);

            csrfToken = await refreshCsrfToken();
            const secondLogin = await agent.post('/users/login')
                .set('Accept', 'text/html')
                .set('x-csrf-token', csrfToken)
                .send({ email: admin.email, password: 'repeatadmin123' })
                .expect(302);
            expect(secondLogin.headers.location).toBe('/users/mfa/verify');
            const secondBlocked = await agent.get('/admin').set('Accept', 'text/html').expect(302);
            expect(secondBlocked.headers.location).toBe('/users/mfa/verify');
        });

        it('requires current MFA or a recovery code to replace the authenticator', async () => {
            const originalSecret = generateSecret();
            const recoveryCode = '1111-2222-3333';
            const admin = await User.create({
                firstName: 'Replace',
                lastName: 'Admin',
                password: 'replaceadmin123',
                email: 'replace-mfa@test.com',
                role: 'Admin',
                roles: ['security_audit_admin'],
                mfaEnabled: true,
                mfaVerified: true,
                mfaSecret: encryptSecret(originalSecret),
                recoveryCodes: [hashRecoveryCode(recoveryCode)],
                status: 'active'
            });
            await signInAdmin(admin.email, 'replaceadmin123');
            expect((await agent.get('/admin/security').expect(200)).text)
                .toContain('Multi-Factor Authentication (MFA)');

            await agent.post('/admin/security/mfa/re-enroll')
                .set('x-csrf-token', csrfToken)
                .send({ password: 'replaceadmin123' })
                .expect(400);
            await agent.post('/admin/security/mfa/re-enroll')
                .set('x-csrf-token', csrfToken)
                .send({ token: '000000' })
                .expect(400);

            let account = await User.findById(admin._id);
            expect(decryptSecret(account.mfaSecret)).toBe(originalSecret);
            const initiated = await agent.post('/admin/security/mfa/re-enroll')
                .set('x-csrf-token', csrfToken)
                .send({ recoveryCode })
                .expect(200);
            expect(initiated.body.qrCode).toMatch(/^data:image\/png;base64,/);
            const replacementSecret = initiated.body.secret;
            account = await User.findById(admin._id);
            expect(decryptSecret(account.mfaSecret)).toBe(originalSecret);
            expect(decryptSecret(account.mfaReplacementPendingSecret)).toBe(replacementSecret);
            expect(await AuditLog.exists({
                actorId: admin._id,
                action: 'admin:mfa:replacement:initiated'
            })).not.toBeNull();

            await agent.post('/admin/security/mfa/re-enroll/confirm')
                .set('x-csrf-token', csrfToken)
                .send({ token: '000000' })
                .expect(400);
            expect(decryptSecret((await User.findById(admin._id)).mfaSecret)).toBe(originalSecret);

            const newToken = speakeasy.totp({ secret: replacementSecret, encoding: 'base32', digits: 6, step: 30 });
            const completed = await agent.post('/admin/security/mfa/re-enroll/confirm')
                .set('x-csrf-token', csrfToken)
                .send({ token: newToken })
                .expect(200);
            expect(completed.body.recoveryCodes).toHaveLength(10);

            account = await User.findById(admin._id);
            expect(decryptSecret(account.mfaSecret)).toBe(replacementSecret);
            expect(account.mfaReplacementPendingSecret).toBe('');
            expect(account.recoveryCodes).toHaveLength(10);
            expect(account.recoveryCodes).not.toContain(hashRecoveryCode(recoveryCode));
            expect(account.sessionVersion).toBe(1);
            expect(await AuditLog.exists({
                actorId: admin._id,
                action: 'admin:mfa:replacement:completed'
            })).not.toBeNull();
            expect(await AuditLog.exists({
                actorId: admin._id,
                action: 'admin:mfa:recovery:used'
            })).not.toBeNull();
            await agent.get('/admin/security').expect(200);
            expect(verifyTokenCounter(replacementSecret, newToken)).not.toBeNull();

            csrfToken = await refreshCsrfToken();
            await agent.post('/users/login')
                .set('Accept', 'text/html')
                .set('x-csrf-token', csrfToken)
                .send({ email: admin.email, password: 'replaceadmin123' })
                .expect(302);
            const nextVerifyPage = await agent.get('/users/mfa/verify').expect(200);
            const nextCsrf = nextVerifyPage.text.match(/<meta name="csrf-token" content="([^"]+)"/);
            const oldToken = speakeasy.totp({ secret: originalSecret, encoding: 'base32', digits: 6, step: 30 });
            await agent.post('/users/mfa/verify')
                .set('x-csrf-token', nextCsrf[1])
                .send({ token: oldToken })
                .expect(400);

            account = await User.findById(admin._id);
            const currentCounter = Math.floor(Date.now() / 30000);
            const freshCounter = Math.max(currentCounter, account.mfaLastUsedCounter + 1);
            const newLoginToken = speakeasy.totp({
                secret: replacementSecret,
                encoding: 'base32',
                digits: 6,
                step: 30,
                time: freshCounter * 30
            });
            await agent.post('/users/mfa/verify')
                .set('x-csrf-token', nextCsrf[1])
                .send({ token: newLoginToken })
                .expect(200);
        });

        it('keeps the active authenticator after replacement cancellation or challenge expiry', async () => {
            const originalSecret = generateSecret();
            const recoveryCodes = ['2222-3333-4444', '3333-4444-5555'];
            const admin = await User.create({
                firstName: 'Cancel',
                lastName: 'Admin',
                password: 'canceladmin123',
                email: 'cancel-mfa@test.com',
                role: 'Admin',
                roles: ['security_audit_admin'],
                mfaEnabled: true,
                mfaSecret: encryptSecret(originalSecret),
                recoveryCodes: recoveryCodes.map(hashRecoveryCode),
                status: 'active'
            });
            await signInAdmin(admin.email, 'canceladmin123');

            await agent.post('/admin/security/mfa/re-enroll')
                .set('x-csrf-token', csrfToken)
                .send({ recoveryCode: recoveryCodes[0] })
                .expect(200);
            await agent.post('/admin/security/mfa/re-enroll/cancel')
                .set('x-csrf-token', csrfToken)
                .send({})
                .expect(200);

            let account = await User.findById(admin._id);
            expect(decryptSecret(account.mfaSecret)).toBe(originalSecret);
            expect(account.mfaReplacementPendingSecret).toBe('');

            await agent.post('/admin/security/mfa/re-enroll')
                .set('x-csrf-token', csrfToken)
                .send({ recoveryCode: recoveryCodes[1] })
                .expect(200);
            await User.updateOne({ _id: admin._id }, {
                $set: { mfaReplacementExpiresAt: new Date(Date.now() - 1000) }
            });
            await agent.post('/admin/security/mfa/re-enroll/confirm')
                .set('x-csrf-token', csrfToken)
                .send({ token: '000000' })
                .expect(401);

            account = await User.findById(admin._id);
            expect(decryptSecret(account.mfaSecret)).toBe(originalSecret);
            expect(account.mfaReplacementPendingSecret).toBe('');
            expect(await AuditLog.exists({
                actorId: admin._id,
                action: 'admin:mfa:replacement:cancelled'
            })).not.toBeNull();
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

        it('grants the existing step-up window after successful login MFA', async () => {
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
                mfaSecret: encryptSecret(generateSecret()),
                status: 'active'
            });
            await admin.save();

            await signInAdmin('stepup@test.com', 'stepupadmin123');

            const res = await agent
                .post('/admin/sensitive-test')
                .set('x-csrf-token', csrfToken)
                .send({});

            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(true);
        });
    });

});