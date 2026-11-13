const request = require('supertest');
const app = require('../server');
const User = require('../models/User');
const Reservation = require('../models/Reservation');
const AuditLog = require('../models/AuditLog');
const HolidayCalendar = require('../models/HolidayCalendar');
const PrivacyRequest = require('../models/PrivacyRequest');
const { encryptPassport, fingerprintPassport } = require('../services/passportEncryption');

describe('MCO2 privacy routes', () => {
  let agent;
  let csrfToken;
  let userId;

  async function refreshCsrfToken() {
    const response = await agent.get('/');
    const match = response.text.match(/<meta name="csrf-token" content="([^"]+)"/);
    if (!match) throw new Error('CSRF token was not rendered.');
    csrfToken = match[1];
  }

  beforeEach(async () => {
    agent = request.agent(app);
    await refreshCsrfToken();
    const admin = await User.create({
      firstName: 'Privacy',
      lastName: 'Officer',
      email: 'privacy-officer@example.com',
      password: 'privacyOfficer123',
      role: 'Admin',
      roles: ['data_protection_officer'],
      permissions: ['reservation:read'],
      mfaEnabled: true,
      mfaVerified: true
    });
    userId = admin._id;
    await agent.post('/users/login')
      .set('x-csrf-token', csrfToken)
      .send({ email: admin.email, password: 'privacyOfficer123' })
      .expect(200);
    await refreshCsrfToken();
  });

  test('does not request insecure-resource upgrades or HTTPS in development', async () => {
    const response = await agent.get('/');
    expect(response.headers['content-security-policy']).not.toContain('upgrade-insecure-requests');
    expect(response.headers['strict-transport-security']).toBeUndefined();
    await agent.get('/src/css/flight.css').expect(200);
    await agent.get('/assets/Logo/logo-white.png').expect(200);
  });

  test('masks passport values in Admin lists and audits authorized reveals', async () => {
    const passport = 'AB123456';
    const reservation = await Reservation.create({
      bookingReference: 'PRIV1234',
      flight: ['507f1f77bcf86cd799439011'],
      passengers: [{
        fullName: 'Test Passenger',
        ageCategory: 'Adult 12+',
        gender: 'Female',
        passportEncrypted: encryptPassport(passport),
        passportFingerprint: fingerprintPassport(passport),
        passportLast3: passport.slice(-3),
        seatNumber: '1A',
        meal: 'None',
        baggageAllowance: 0
      }],
      price: 100,
      status: 'Confirmed'
    });
    const passengerId = String(reservation.passengers[0]._id);

    const adminList = await agent.get('/admin/reservations').expect(200);
    expect(adminList.text).toContain('••••••456');
    expect(adminList.text).not.toContain(passport);
    expect(adminList.text).not.toContain('Female');

    const reveal = await agent.post('/privacy/passports/reveal')
      .set('x-csrf-token', csrfToken)
      .send({
        reservationId: String(reservation._id),
        passengerId,
        reason: 'Confirm identity for a documented travel correction.',
        confirmed: true
      })
      .expect(200);

    expect(reveal.body).toEqual({ success: true, passport });
    const auditEvent = await AuditLog.findOne({ action: 'passport:reveal' }).lean();
    expect(auditEvent).toMatchObject({
      action: 'passport:reveal',
      resourceId: passengerId,
      reason: 'Confirm identity for a documented travel correction.'
    });
  });

  test('withdraws meal consent immediately and records a completed privacy request', async () => {
    const currentYear = new Date().getFullYear();
    await HolidayCalendar.create([currentYear, currentYear + 1].map(year => ({
      year,
      version: `TEST-PH-${year}`,
      operatingLocation: 'Philippines',
      sourceReference: 'Test calendar',
      publishedAt: new Date(),
      holidays: []
    })));
    const reservation = await Reservation.create({
      userId,
      bookingReference: 'MEAL1234',
      flight: ['507f1f77bcf86cd799439011'],
      passengers: [{
        fullName: 'Test Passenger',
        ageCategory: 'Adult 12+',
        gender: 'Female',
        passportLast3: '456',
        seatNumber: '1A',
        meal: 'Vegan',
        mealConsent: {
          granted: true,
          version: 'MEAL-CONSENT-1',
          consentedAt: new Date()
        },
        baggageAllowance: 0
      }],
      price: 100,
      status: 'Confirmed'
    });

    await agent.post('/privacy/withdraw-meal-consent')
      .set('x-csrf-token', csrfToken)
      .send({
        reservationId: String(reservation._id),
        passengerId: String(reservation.passengers[0]._id)
      })
      .expect(200, { success: true });

    const updated = await Reservation.findById(reservation._id);
    expect(updated.passengers[0].meal).toBe('None');
    expect(updated.passengers[0].mealConsent.granted).toBe(false);
    expect(updated.passengers[0].mealConsent.withdrawnAt).toBeInstanceOf(Date);
    await expect(PrivacyRequest.findOne({
      requesterId: userId,
      type: 'consent-withdrawal',
      status: 'COMPLETED'
    })).resolves.toBeTruthy();
  });
});
