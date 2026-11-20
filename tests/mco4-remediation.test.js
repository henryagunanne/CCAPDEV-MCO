// MCO4 remediation regression tests: one test per confirmed finding fixed on the
// mco4-security-fixes branch. Each test fails on the original ITSSDLC code and passes after the fix.
const request = require('supertest');
const speakeasy = require('speakeasy');
const app = require('../server');
const User = require('../models/User');
const Flight = require('../models/Flight');
const BookingIntegrityState = require('../models/BookingIntegrityState');
const Reservation = require('../models/Reservation');
const SeatAllocation = require('../models/SeatAllocation');
const AuditLog = require('../models/AuditLog');
const { encryptPassport, fingerprintPassport } = require('../services/passportEncryption');
const { encryptSecret, decryptSecret, generateSecret } = require('../services/mfa');
const { ensureAircraftLayout } = require('../services/seatAllocationService');

async function csrfFor(agent, path = '/') {
  const page = await agent.get(path).set('Accept', 'text/html');
  const match = page.text.match(/<meta name="csrf-token" content="([^"]+)"/);
  if (!match) throw new Error('CSRF token was not rendered.');
  return match[1];
}

async function customer(email, password = 'Customer!2026') {
  const user = await User.create({ firstName: 'Test', lastName: 'Customer', email, password });
  const agent = request.agent(app);
  const token = await csrfFor(agent);
  await agent.post('/users/login').set('x-csrf-token', token).send({ email, password }).expect(200);
  return { user, agent, password, csrf: await csrfFor(agent) };
}

async function admin(email, roles, permissions = []) {
  const secret = generateSecret();
  const user = await User.create({
    firstName: 'Test', lastName: 'Admin', email, password: 'AdminPass!2026x', role: 'Admin', roles, permissions,
    mfaEnabled: true, mfaVerified: true, mfaSecret: encryptSecret(secret)
  });
  const agent = request.agent(app);
  let token = await csrfFor(agent);
  await agent.post('/users/login').set('Accept', 'text/html').set('x-csrf-token', token)
    .send({ email, password: 'AdminPass!2026x' }).expect(302);
  token = await csrfFor(agent, '/users/mfa/verify');
  await agent.post('/users/mfa/verify').set('x-csrf-token', token)
    .send({ token: speakeasy.totp({ secret, encoding: 'base32', digits: 6, step: 30 }) }).expect(200);
  return { user, agent, csrf: await csrfFor(agent) };
}

function passengerReservation(userId, overrides = {}) {
  const passport = 'AB123456';
  return Reservation.create({
    userId, bookingReference: 'AAMCO4TEST1', flight: ['507f1f77bcf86cd799439011'],
    passengers: [{ fullName: 'Test Passenger', ageCategory: 'Adult 12+', gender: 'Female',
      passportEncrypted: encryptPassport(passport), passportFingerprint: fingerprintPassport(passport),
      passportLast3: passport.slice(-3), seatNumber: '1A', meal: 'None', baggageAllowance: 0 }],
    price: 100, status: 'Confirmed', ...overrides
  });
}

describe('MCO4 remediation', () => {
  test('VULN-01: customer booking page renders for a flight with a seat layout', async () => {
    const layout = await ensureAircraftLayout('A320', 30);
    const flight = await Flight.create({ flightNumber: 'MC401', origin: 'Manila (MNL)', destination: 'Cebu (CEB)',
      departureDate: '2030-01-15', departureTime: '08:00', arrivalTime: '09:30', aircraft: 'A320',
      seatCapacity: 30, price: 1000, status: 'Scheduled', aircraftLayoutId: layout._id });
    await BookingIntegrityState.updateOne({ _id: 'booking-integrity-v1' },
      { $set: { ready: true, version: 1, indexName: 'unique_flight_seat', verifiedAt: new Date() } }, { upsert: true });
    const { agent } = await customer('booker@example.com');
    const page = await agent.get(`/reservations/book/${flight._id}?travelClass=Economy&tripType=One-Way`).set('Accept', 'text/html');
    expect(page.status).toBe(200);
    expect(page.text).toContain('MC401');
  });

  test('VULN-02: only roles holding passport:reveal can see a full passport number', async () => {
    const reservation = await passengerReservation(null);
    const body = { reservationId: String(reservation._id), passengerId: String(reservation.passengers[0]._id),
      reason: 'Confirm identity for a documented travel correction.', confirmed: true };
    const ops = await admin('ops@example.com', ['flight_operations_admin']);
    const denied = await ops.agent.post('/privacy/passports/reveal').set('x-csrf-token', ops.csrf).send(body);
    expect(denied.status).toBe(403);
    expect(denied.text).not.toContain('AB123456');
    const dpo = await admin('dpo@example.com', ['data_protection_officer']);
    const allowed = await dpo.agent.post('/privacy/passports/reveal').set('x-csrf-token', dpo.csrf).send(body);
    expect(allowed.status).toBe(200);
    expect(allowed.body.passport).toBe('AB123456');
  });

  test('VULN-03: administrators cannot delete customer accounts through /users/delete', async () => {
    const victim = await User.create({ firstName: 'Victim', lastName: 'Customer', email: 'victim@example.com', password: 'Customer!2026' });
    const ops = await admin('ops2@example.com', ['flight_operations_admin']);
    const res = await ops.agent.post(`/users/delete/${victim._id}`).set('x-csrf-token', ops.csrf).send({});
    expect(res.status).toBe(403);
    expect(await User.exists({ _id: victim._id })).toBeTruthy();
    const denial = await AuditLog.findOne({ action: 'authz:denied', resourceId: String(victim._id) }).lean();
    expect(String(denial.actorId)).toBe(String(ops.user._id));
  });

  test('VULN-03: a disabled account\'s existing session is rejected on customer routes', async () => {
    const { user, agent } = await customer('stale@example.com');
    await User.updateOne({ _id: user._id }, { $set: { status: 'disabled' }, $inc: { sessionVersion: 1 } });
    const res = await agent.get('/reservations/my-bookings').set('Accept', 'text/html');
    expect(res.status).toBe(401);
  });

  test('VULN-06: changing the password ends the account\'s other sessions', async () => {
    const first = await customer('rotate@example.com');
    const second = request.agent(app);
    const token = await csrfFor(second);
    await second.post('/users/login').set('x-csrf-token', token).send({ email: 'rotate@example.com', password: first.password }).expect(200);
    await first.agent.post(`/users/change-password/${first.user._id}`).set('x-csrf-token', first.csrf)
      .send({ currentPassword: first.password, newPassword: 'Rotated!2026', confirmNewPassword: 'Rotated!2026' }).expect(200);
    expect((await second.get('/reservations/my-bookings').set('Accept', 'text/html')).status).toBe(401);
    expect((await first.agent.get('/reservations/my-bookings').set('Accept', 'text/html')).status).toBe(200);
  });

  test('VULN-05: unknown, wrong-password and locked logins get the same reply', async () => {
    await User.create({ firstName: 'Locked', lastName: 'Out', email: 'locked@example.com', password: 'Customer!2026',
      loginAttempts: 5, lockUntil: new Date(Date.now() + 10 * 60 * 1000) });
    await User.create({ firstName: 'Plain', lastName: 'User', email: 'plain@example.com', password: 'Customer!2026' });
    const agent = request.agent(app);
    const token = await csrfFor(agent);
    const replies = [];
    for (const email of ['nobody@example.com', 'plain@example.com', 'locked@example.com']) {
      const r = await agent.post('/users/login').set('x-csrf-token', token).send({ email, password: 'Wrong!Password1' });
      replies.push([r.status, r.body.message]);
    }
    expect(replies[0]).toEqual([401, 'Invalid email or password.']);
    expect(replies[1]).toEqual(replies[0]);
    expect(replies[2]).toEqual(replies[0]);
  });

  test('VULN-07: unauthenticated reservation requests get 401', async () => {
    const res = await request(app).get('/reservations/my-bookings').set('Accept', 'text/html');
    expect(res.status).toBe(401);
  });

  test('VULN-08: check-in failures share one generic message', async () => {
    await passengerReservation(null, { passengers: [{ fullName: 'Checked Passenger', ageCategory: 'Adult 12+', gender: 'Male',
      passportEncrypted: encryptPassport('CD123456'), passportFingerprint: fingerprintPassport('CD123456'), passportLast3: '456',
      seatNumber: '2A', meal: 'None', baggageAllowance: 0, checkedIn: true }] });
    const agent = request.agent(app);
    const token = await csrfFor(agent);
    const already = await agent.post('/reservations/check-in').set('x-csrf-token', token).send({ pnr: 'AAMCO4TEST1', fullName: 'Checked Passenger' });
    const wrong = await agent.post('/reservations/check-in').set('x-csrf-token', token).send({ pnr: 'AAMCO4TEST1', fullName: 'Someone Else' });
    expect(already.body.success).toBe(false);
    expect(already.body.message).toBe(wrong.body.message);
  });

  test('VULN-10: only allow-listed static folders are served', async () => {
    expect((await request(app).get('/src/html/admin.html')).status).toBe(404);
    expect((await request(app).get('/src/css/navbar.css')).status).toBe(200);
  });

  test('VULN-11: flight deletion is audited and refused while bookings exist', async () => {
    const rootAgain = await admin('root4@example.com', ['flight_operations_admin'], ['flight:delete']);
    const booked = await Flight.create({ flightNumber: 'MC402', origin: 'Manila (MNL)', destination: 'Cebu (CEB)', departureDate: '2030-02-01',
      departureTime: '08:00', arrivalTime: '09:30', aircraft: 'A320', seatCapacity: 2, price: 1000, status: 'Scheduled', bookedSeats: 1 });
    await SeatAllocation.create({ flightId: booked._id, seatNumber: '1A', reservationId: '507f1f77bcf86cd799439012', passengerIndex: 0, attemptId: 'mco4-test' });
    const free = await Flight.create({ flightNumber: 'MC403', origin: 'Manila (MNL)', destination: 'Cebu (CEB)', departureDate: '2030-02-02',
      departureTime: '08:00', arrivalTime: '09:30', aircraft: 'A320', seatCapacity: 2, price: 1000, status: 'Scheduled' });
    const csrf = await csrfFor(rootAgain.agent, '/admin/flights');
    expect((await rootAgain.agent.delete(`/admin/delete/${booked._id}`).set('x-csrf-token', csrf)).status).toBe(409);
    expect((await rootAgain.agent.delete(`/admin/delete/${free._id}`).set('x-csrf-token', csrf)).status).toBe(200);
    const event = await AuditLog.findOne({ action: 'flight:delete', resourceId: String(free._id) }).lean();
    expect(String(event.actorId)).toBe(String(rootAgain.user._id));
  });

  test('VULN-12: profile edits are validated on the server', async () => {
    const { user, agent, csrf } = await customer('editor@example.com');
    const bad = await agent.post(`/users/edit/${user._id}`).set('x-csrf-token', csrf).send({ email: 'not-an-email' });
    expect(bad.status).toBe(400);
    const html = await agent.post(`/users/edit/${user._id}`).set('x-csrf-token', csrf).send({ lastName: '<b>x</b>' });
    expect(html.status).toBe(400);
  });

  test('VULN-15: MFA secrets with a truncated GCM tag are rejected', () => {
    const [iv, tag, ct] = encryptSecret('JBSWY3DPEHPK3PXP').split(':');
    expect(decryptSecret([iv, tag, ct].join(':'))).toBe('JBSWY3DPEHPK3PXP');
    expect(decryptSecret([iv, tag.slice(0, 8), ct].join(':'))).toBe('');
  });
});
