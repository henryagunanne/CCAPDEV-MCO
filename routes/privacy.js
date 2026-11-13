const express = require('express');
const bcrypt = require('bcrypt');
const User = require('../models/User');
const Reservation = require('../models/Reservation');
const PrivacyRequest = require('../models/PrivacyRequest');
const HolidayCalendar = require('../models/HolidayCalendar');
const { calculatePrivacyDeadlines } = require('../services/privacyDeadlines');
const { getStoredPassport, maskPassport } = require('../services/passportEncryption');
const { recordAuditEvent } = require('../services/auditService');
const { requireAdminAccess, requirePermission } = require('../middleware/adminAuth');
const { permissions } = require('../config/rbac');
const { dpoContact } = require('../config/env');
const { getAdminNavigation } = require('../services/adminNavigation');
const mongoose = require('mongoose');
const { validatePassengers, BookingInputError } = require('../services/bookingValidation');
const { updateReservation, cancelReservation, BookingConflictError } = require('../services/bookingService');
const { encryptPassport, fingerprintPassport } = require('../services/passportEncryption');
const { isTodayOrFutureInManila } = require('../services/manilaDate');
const logger = require('../logs/logger');

const router = express.Router();
const requestTypes = new Set(['access', 'correction', 'deletion', 'consent-withdrawal']);


/** * Middleware to ensure the user is authenticated.
 * If the user is not authenticated, respond with a 401 Unauthorized status.
 */
function requireUser(req, res, next) {
  if (!req.session?.user) return res.status(401).json({ success: false, message: 'Authentication required.' });
  return next();
}


/** * Retrieve the active holiday calendars, selecting the most recent one for each year. 
 * @returns {Promise<Map<number, Object>>} - A promise that resolves to a map of year to holiday calendar objects.
 * */
async function activeCalendarsByYear() {
  const calendars = await HolidayCalendar.find().sort({ year: 1, publishedAt: -1 }).lean();
  const selected = new Map();
  for (const calendar of calendars) {
    if (!selected.has(calendar.year)) selected.set(calendar.year, calendar);
  }
  return selected;
}


/** * Create a new privacy request and record an audit event for it.
 * @param {Object} options - Options for creating the request.
 * @param {string} options.type - The type of privacy request (e.g., 'access', 'correction').
 * @param {string} options.subjectType - The subject type of the request (e.g., 'account-holder', 'co-passenger').
 * @param {string|null} [options.requesterId=null] - The ID of the user making the request, if applicable.
 * @param {string|null} [options.reservationId=null] - The ID of the reservation related to the request, if applicable.
 * @param {string|null} [options.passengerId=null] - The ID of the passenger related to the request, if applicable.
 * @param {Object} options.req - The Express request object, used for logging the actor.
 * @returns {Promise<PrivacyRequest>} - A promise that resolves to the created PrivacyRequest document.
 * */
async function createRequest({ type, subjectType, requesterId = null, reservationId = null, passengerId = null, req }) {
  const receivedAt = new Date();
  const deadlines = calculatePrivacyDeadlines(receivedAt, await activeCalendarsByYear());
  const request = await PrivacyRequest.create({
    type,
    subjectType,
    requesterId,
    reservationId,
    passengerId,
    receivedAt,
    ...deadlines
  });
  await recordAuditEvent({
    actorId: requesterId || req.session?.user?._id,
    actorRole: requesterId ? 'user' : 'data_protection_officer',
    action: 'privacy:request:received',
    resourceType: 'PrivacyRequest',
    resourceId: request._id,
    correlationId: String(request._id)
  });
  return request;
}


/** * Create a view of a passenger's data suitable for privacy request responses, masking sensitive information.
 * @param {Object} passenger - The passenger document from the database.
 * @returns {Object} - An object containing the passenger's data with sensitive fields masked or omitted.
 * */
function passengerAccessView(passenger) {
  return {
    fullName: passenger.fullName,
    ageCategory: passenger.ageCategory,
    gender: passenger.gender,
    passport: maskPassport(passenger.passportLast3
      ? `xxxxxxxx${passenger.passportLast3}`
      : getStoredPassport(passenger)),
    seatNumber: passenger.seatNumber,
    returnSeatNumber: passenger.returnSeatNumber,
    meal: passenger.meal,
    baggageAllowance: passenger.baggageAllowance
  };
}

async function findVerifiedCoPassenger(pnr, fullName, passport) {
  if (!/^[A-Z0-9]{6,12}$/.test(pnr) ||
      !/^[\p{L}][\p{L}\p{M}' -]{1,98}$/u.test(fullName) ||
      !/^[A-Z0-9]{6,9}$/.test(passport)) return null;
  const reservation = await Reservation.findOne({ bookingReference: pnr })
    .select('+passengers.passport +passengers.passportEncrypted +passengers.passportFingerprint')
    .populate({ path: 'flight', select: 'departureDate flightNumber origin destination' });
  const passenger = reservation?.passengers.find(entry =>
    entry.fullName.trim().toLocaleLowerCase('en') === fullName.toLocaleLowerCase('en') &&
    getStoredPassport(entry)?.toUpperCase() === passport
  );
  return reservation && passenger ? { reservation, passenger } : null;
}

/// Privacy Policy Route
router.get('/privacy-policy', (req, res) => res.render('privacy-policy', {
  title: 'Privacy Notice',
  layout: 'main',
  dpoContact
}));

/// Terms of Service Route
router.post('/privacy/passports/reveal', requireAdminAccess, async (req, res) => {
  const { reservationId, passengerId, reason, confirmed } = req.body;
  if (!mongoose.isValidObjectId(reservationId) || !mongoose.isValidObjectId(passengerId) ||
      typeof reason !== 'string' || reason.trim().length < 20 || reason.trim().length > 500 ||
      confirmed !== true) {
    return res.status(400).json({
      success: false,
      message: 'A valid reservation, passenger, confirmation, and purpose of at least 20 characters are required.'
    });
  }
  try {
    const reservation = await Reservation.findById(reservationId)
      .select('+passengers.passport +passengers.passportEncrypted');
    const passenger = reservation?.passengers.id(passengerId);
    if (!passenger) {
      return res.status(404).json({ success: false, message: 'Passenger record not found.' });
    }
    const passport = getStoredPassport(passenger);
    if (!passport) {
      return res.status(410).json({ success: false, message: 'Passport data is no longer available.' });
    }
    await recordAuditEvent({
      actorId: req.session.user._id,
      actorRole: req.session.user.role || 'Admin',
      action: 'passport:reveal',
      resourceType: 'ReservationPassenger',
      resourceId: passengerId,
      reason: reason.trim(),
      reasonCode: 'AUTHORIZED_ADMIN_REVEAL',
      ipAddress: req.ip
    });
    return res.json({ success: true, passport });
  } catch (error) {
    logger.error('Passport reveal failed.', { code: error.code || 'PASSPORT_REVEAL_ERROR' });
    return res.status(500).json({ success: false, message: 'Unable to reveal passport data.' });
  }
});

/// GET /privacy/my-privacy - Display the user's privacy requests
router.get('/privacy/my-privacy', requireUser, async (req, res) => {
  const [requests, reservations] = await Promise.all([
    PrivacyRequest.find({ requesterId: req.session.user._id })
    .select('type status receivedAt acknowledgementDueAt completionDueAt acknowledgedAt completedAt')
    .sort({ receivedAt: -1 })
    .lean(),
    Reservation.find({ userId: req.session.user._id })
      .select('bookingReference passengers._id passengers.fullName passengers.meal passengers.mealConsent.granted')
      .sort({ bookingDate: -1 })
      .lean()
  ]);
  return res.render('users/my-privacy', { title: 'My Privacy', requests, reservations });
});


/// GET /privacy/my-requests - Return the user's privacy requests as JSON
router.get('/privacy/my-requests', requireUser, async (req, res) => {
  const requests = await PrivacyRequest.find({ requesterId: req.session.user._id })
    .select('type status receivedAt acknowledgementDueAt completionDueAt acknowledgedAt completedAt')
    .sort({ receivedAt: -1 })
    .lean();
  return res.json({ requests });
});

/// POST /privacy/requests - Create a new privacy request for the authenticated user
router.post('/privacy/requests', requireUser, async (req, res) => {
  const { type, reservationId, passengerId } = req.body;
  if (!requestTypes.has(type)) {
    return res.status(400).json({ success: false, message: 'Select a valid privacy request type.' });
  }
  if (type === 'consent-withdrawal') {
    return res.status(400).json({ success: false, message: 'Use the meal-consent withdrawal action.' });
  }
  if ((reservationId && !/^[a-f\d]{24}$/i.test(reservationId)) ||
      (passengerId && !/^[a-f\d]{24}$/i.test(passengerId))) {
    return res.status(400).json({ success: false, message: 'Request reference is invalid.' });
  }
  const request = await createRequest({
    type,
    subjectType: 'account-holder',
    requesterId: req.session.user._id,
    reservationId: reservationId || null,
    passengerId: passengerId || null,
    req
  });
  return res.status(201).json({
    success: true,
    request: {
      id: request._id,
      status: request.status,
      acknowledgementDueAt: request.acknowledgementDueAt,
      completionDueAt: request.completionDueAt
    }
  });
});


/// POST /privacy/export - Export the user's personal data and reservations
router.post('/privacy/export', requireUser, async (req, res) => {
  const user = await User.findById(req.session.user._id);
  if (!user || !(await bcrypt.compare(String(req.body.currentPassword || ''), user.password))) {
    return res.status(403).json({ success: false, message: 'Password verification failed.' });
  }
  const request = await createRequest({
    type: 'access',
    subjectType: 'account-holder',
    requesterId: user._id,
    req
  });
  request.status = 'COMPLETED';
  request.acknowledgedAt = new Date();
  request.completedAt = request.acknowledgedAt;
  await request.save();
  await recordAuditEvent({
    actorId: user._id,
    actorRole: user.role || 'user',
    action: 'privacy:request:completed',
    resourceType: 'PrivacyRequest',
    resourceId: request._id,
    correlationId: String(request._id)
  });

  const reservations = await Reservation.find({ userId: user._id })
    .populate({ path: 'flight', select: 'flightNumber origin destination departureDate departureTime arrivalTime' })
    .lean();
  const exportedReservations = reservations.map(reservation => ({
    bookingReference: reservation.bookingReference,
    flight: reservation.flight,
    tripType: reservation.tripType,
    travelClass: reservation.travelClass,
    price: reservation.price,
    bookingDate: reservation.bookingDate,
    status: reservation.status,
    passengers: reservation.passengers.map(passengerAccessView)
  }));
  return res.json({
    requestId: request._id,
    profile: {
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      createdAt: user.createdAt
    },
    bookings: exportedReservations
  });
});


router.post('/privacy/withdraw-meal-consent', requireUser, async (req, res) => {
  const { reservationId, passengerId } = req.body;
  if (!/^[a-f\d]{24}$/i.test(String(reservationId || '')) ||
      !/^[a-f\d]{24}$/i.test(String(passengerId || ''))) {
    return res.status(400).json({ success: false, message: 'Request reference is invalid.' });
  }
  const reservation = await Reservation.findOne({
    _id: reservationId,
    userId: req.session.user._id
  });
  const passenger = reservation?.passengers.id(passengerId);
  if (!reservation || !passenger) {
    return res.status(404).json({ success: false, message: 'Reservation not found.' });
  }
  const privacyRequest = await createRequest({
    type: 'consent-withdrawal',
    subjectType: 'account-holder',
    requesterId: req.session.user._id,
    reservationId: reservation._id,
    passengerId: passenger._id,
    req
  });
  passenger.meal = 'None';
  passenger.mealConsent = {
    granted: false,
    version: passenger.mealConsent?.version || '',
    consentedAt: passenger.mealConsent?.consentedAt || null,
    withdrawnAt: new Date()
  };
  await reservation.save();
  await recordAuditEvent({
    actorId: req.session.user._id,
    actorRole: req.session.user.role || 'user',
    action: 'privacy:meal-consent:withdraw',
    resourceType: 'Reservation',
    resourceId: reservation._id
  });
  privacyRequest.status = 'COMPLETED';
  privacyRequest.acknowledgedAt = new Date();
  privacyRequest.completedAt = privacyRequest.acknowledgedAt;
  await privacyRequest.save();
  await recordAuditEvent({
    actorId: req.session.user._id,
    actorRole: req.session.user.role || 'user',
    action: 'privacy:request:completed',
    resourceType: 'PrivacyRequest',
    resourceId: privacyRequest._id,
    correlationId: String(privacyRequest._id)
  });
  return res.json({ success: true });
});


/// POST /privacy/dpo/co-passenger-access - Handle a co-passenger access request by a DPO
router.post('/privacy/dpo/co-passenger-access', requireAdminAccess,
  requirePermission(permissions.PRIVACY_REQUEST_MANAGE), async (req, res) => {
    const pnr = String(req.body.pnr || '').trim().toUpperCase();
    const fullName = String(req.body.fullName || '').trim();
    const passport = String(req.body.passport || '').trim().toUpperCase();
    if (!/^[A-Z0-9]{6,12}$/.test(pnr) || !fullName || !/^[A-Z0-9]{6,9}$/.test(passport)) {
      return res.status(400).json({ success: false, message: 'Unable to verify the request.' });
    }
    const reservation = await Reservation.findOne({ bookingReference: pnr })
      .select('+passengers.passport +passengers.passportEncrypted')
      .populate({ path: 'flight', select: 'flightNumber origin destination departureDate departureTime arrivalTime' });
    const passenger = reservation?.passengers.find(entry =>
      entry.fullName.trim().toLocaleLowerCase('en') === fullName.toLocaleLowerCase('en') &&
      getStoredPassport(entry)?.toUpperCase() === passport
    );
    if (!reservation || !passenger) {
      await recordAuditEvent({
        actorId: req.session.user._id,
        actorRole: 'data_protection_officer',
        action: 'privacy:request:identity-check',
        resourceType: 'Reservation',
        resourceId: reservation?._id || '',
        result: 'FAILURE',
        reasonCode: 'IDENTITY_NOT_VERIFIED'
      });
      return res.status(400).json({ success: false, message: 'Unable to verify the request.' });
    }
    const privacyRequest = await createRequest({
      type: 'access',
      subjectType: 'co-passenger',
      reservationId: reservation._id,
      passengerId: passenger._id,
      req
    });
    privacyRequest.status = 'COMPLETED';
    privacyRequest.acknowledgedAt = new Date();
    privacyRequest.completedAt = privacyRequest.acknowledgedAt;
    await privacyRequest.save();
    await recordAuditEvent({
      actorId: req.session.user._id,
      actorRole: 'data_protection_officer',
      action: 'privacy:request:completed',
      resourceType: 'PrivacyRequest',
      resourceId: privacyRequest._id,
      correlationId: String(privacyRequest._id)
    });
    return res.json({
      requestId: privacyRequest._id,
      passenger: passengerAccessView(passenger),
      booking: {
        bookingReference: reservation.bookingReference,
        flight: reservation.flight,
        status: reservation.status,
        price: reservation.price,
        bookingDate: reservation.bookingDate
      }
    });
  });

router.post('/privacy/dpo/co-passenger-correction', requireAdminAccess,
  requirePermission(permissions.PRIVACY_REQUEST_MANAGE), async (req, res) => {
    const allowed = new Set([
      'pnr', 'fullName', 'passport', 'newFullName',
      'ageCategory', 'gender', 'replacementPassport'
    ]);
    try {
      if (Object.keys(req.body).some(key => !allowed.has(key))) {
        return res.status(400).json({ success: false, message: 'Correction fields are invalid.' });
      }
      const verified = await findVerifiedCoPassenger(
        String(req.body.pnr || '').trim().toUpperCase(),
        String(req.body.fullName || '').trim(),
        String(req.body.passport || '').trim().toUpperCase()
      );
      if (!verified) return res.status(400).json({ success: false, message: 'Unable to verify the request.' });

      const { reservation, passenger } = verified;
      const changes = ['newFullName', 'ageCategory', 'gender', 'replacementPassport']
        .some(field => Object.prototype.hasOwnProperty.call(req.body, field));
      if (!changes) return res.status(400).json({ success: false, message: 'Provide at least one correction.' });
      if (Object.prototype.hasOwnProperty.call(req.body, 'newFullName') &&
          (typeof req.body.newFullName !== 'string' ||
           !/^[\p{L}][\p{L}\p{M}' -]{1,98}$/u.test(req.body.newFullName.trim()))) {
        return res.status(400).json({ success: false, message: 'Corrected name is invalid.' });
      }
      if (Object.prototype.hasOwnProperty.call(req.body, 'ageCategory') &&
          !['Adult 12+', 'Child 2–11', 'Infant under 2'].includes(req.body.ageCategory)) {
        return res.status(400).json({ success: false, message: 'Corrected age category is invalid.' });
      }
      if (Object.prototype.hasOwnProperty.call(req.body, 'gender') &&
          !['Male', 'Female', 'Other'].includes(req.body.gender)) {
        return res.status(400).json({ success: false, message: 'Corrected gender is invalid.' });
      }
      let replacement;
      if (Object.prototype.hasOwnProperty.call(req.body, 'replacementPassport')) {
        if (typeof req.body.replacementPassport !== 'string' ||
            !/^[A-Za-z0-9]{6,9}$/.test(req.body.replacementPassport.trim())) {
          return res.status(400).json({ success: false, message: 'Corrected passport number is invalid.' });
        }
        replacement = req.body.replacementPassport.trim().toUpperCase();
      }
      const request = await createRequest({
        type: 'correction',
        subjectType: 'co-passenger',
        reservationId: reservation._id,
        passengerId: passenger._id,
        req
      });
      if (req.body.newFullName !== undefined) passenger.fullName = req.body.newFullName.trim();
      if (req.body.ageCategory !== undefined) passenger.ageCategory = req.body.ageCategory;
      if (req.body.gender !== undefined) passenger.gender = req.body.gender;
      if (replacement) {
        passenger.passportEncrypted = encryptPassport(replacement);
        passenger.passportFingerprint = fingerprintPassport(replacement);
        passenger.passportLast3 = replacement.slice(-3);
        passenger.passport = undefined;
      }
      await reservation.save();
      await recordAuditEvent({
        actorId: req.session.user._id,
        actorRole: 'data_protection_officer',
        action: 'privacy:passenger:correct',
        resourceType: 'ReservationPassenger',
        resourceId: passenger._id,
        reasonCode: 'IDENTITY_VERIFIED',
        correlationId: String(request._id)
      });
      request.status = 'COMPLETED';
      request.decisionCode = 'CORRECTION_APPLIED';
      request.acknowledgedAt = new Date();
      request.completedAt = request.acknowledgedAt;
      await request.save();
      return res.json({
        success: true,
        requestId: request._id,
        acknowledgementDueAt: request.acknowledgementDueAt,
        completionDueAt: request.completionDueAt
      });
    } catch (error) {
      if (error instanceof BookingInputError || error instanceof BookingConflictError) {
        return res.status(error.statusCode).json({ success: false, message: error.message });
      }
      logger.error('Co-passenger correction failed.', { code: error.code || 'CO_PASSENGER_CORRECTION_ERROR' });
      return res.status(error.code === 11000 ? 409 : 500).json({
        success: false,
        message: error.code === 11000 ? 'The corrected passport is already in use.' : 'Unable to process the correction.'
      });
    }
  });

router.post('/privacy/dpo/co-passenger-deletion', requireAdminAccess,
  requirePermission(permissions.PRIVACY_REQUEST_MANAGE), async (req, res) => {
    const verified = await findVerifiedCoPassenger(
      String(req.body.pnr || '').trim().toUpperCase(),
      String(req.body.fullName || '').trim(),
      String(req.body.passport || '').trim().toUpperCase()
    );
    if (!verified) return res.status(400).json({ success: false, message: 'Unable to verify the request.' });

    try {
      const { reservation, passenger } = verified;
      const passengerId = passenger._id;
      const request = await createRequest({
        type: 'deletion',
        subjectType: 'co-passenger',
        reservationId: reservation._id,
        passengerId,
        req
      });
      const hasFutureTravel = reservation.flight.some(flight =>
        isTodayOrFutureInManila(flight.departureDate)
      );
      if (hasFutureTravel && reservation.passengers.length > 1) {
        const remainingPassengers = reservation.passengers
          .filter(entry => String(entry._id) !== String(passengerId))
          .map(entry => ({
            fullName: entry.fullName,
            ageCategory: entry.ageCategory,
            gender: entry.gender,
            passport: getStoredPassport(entry),
            meal: entry.meal,
            mealConsent: entry.mealConsent?.granted === true,
            baggageAllowance: entry.baggageAllowance,
            seatNumber: entry.seatNumber,
            returnSeatNumber: entry.returnSeatNumber
          }));
        const validatedPassengers = validatePassengers(remainingPassengers, reservation.tripType);
        await updateReservation({
          reservation,
          passengers: validatedPassengers,
          preservePrice: true
        });
      } else {
        if (hasFutureTravel) await cancelReservation(reservation);
        const currentReservation = await Reservation.findById(reservation._id)
          .select('+passengers.passportFingerprint');
        const currentPassenger = currentReservation?.passengers.id(passengerId);
        if (!currentPassenger) throw new Error('Passenger record disappeared during deletion processing.');
        const passengerIndex = currentReservation.passengers.indexOf(currentPassenger);
        currentPassenger.fullName = `Passenger ${passengerIndex + 1}`;
        currentPassenger.ageCategory = undefined;
        currentPassenger.passport = undefined;
        currentPassenger.passportEncrypted = undefined;
        currentPassenger.passportFingerprint = undefined;
        currentPassenger.passportLast3 = undefined;
        currentPassenger.meal = 'None';
        currentPassenger.mealConsent = {
          granted: false,
          version: '',
          consentedAt: null,
          withdrawnAt: null
        };
        await currentReservation.save();
      }
      await recordAuditEvent({
        actorId: req.session.user._id,
        actorRole: 'data_protection_officer',
        action: 'privacy:passenger:delete',
        resourceType: 'ReservationPassenger',
        resourceId: passengerId,
        reasonCode: hasFutureTravel ? 'PASSENGER_CANCELLED' : 'IDENTITY_REMOVED',
        correlationId: String(request._id)
      });
      request.status = 'COMPLETED';
      request.decisionCode = hasFutureTravel ? 'PASSENGER_CANCELLED' : 'IDENTITY_REMOVED';
      request.acknowledgedAt = new Date();
      request.completedAt = request.acknowledgedAt;
      await request.save();
      return res.json({
        success: true,
        requestId: request._id,
        acknowledgementDueAt: request.acknowledgementDueAt,
        completionDueAt: request.completionDueAt
      });
    } catch (error) {
      if (error instanceof BookingInputError || error instanceof BookingConflictError) {
        return res.status(error.statusCode).json({ success: false, message: error.message });
      }
      logger.error('Co-passenger deletion failed.', { code: error.code || 'CO_PASSENGER_DELETION_ERROR' });
      return res.status(500).json({ success: false, message: 'Unable to process the deletion request.' });
    }
  });


/// GET /privacy/dpo/requests - Return all open privacy requests for DPO review
router.get('/privacy/dpo/requests', requireAdminAccess,
  requirePermission(permissions.PRIVACY_REQUEST_MANAGE), async (req, res) => {
    const requests = await PrivacyRequest.find({ status: { $nin: ['COMPLETED', 'REFUSED'] } })
      .select('type subjectType receivedAt acknowledgementDueAt completionDueAt acknowledgedAt status')
      .sort({ completionDueAt: 1 })
      .lean();
    return res.json({ requests });
  });

router.get('/privacy/dpo/manage', requireAdminAccess,
  requirePermission(permissions.PRIVACY_REQUEST_MANAGE), async (req, res) => {
    const requests = await PrivacyRequest.find({ status: { $nin: ['COMPLETED', 'REFUSED'] } })
      .select('type subjectType receivedAt acknowledgementDueAt completionDueAt acknowledgedAt status')
      .sort({ completionDueAt: 1 })
      .lean();
    return res.render('admin/privacy-requests', {
      layout: 'admin',
      title: 'Privacy Requests',
      admin: req.authenticatedUser,
      ...getAdminNavigation(req.authenticatedUser),
      requests
    });
  });

router.post('/privacy/dpo/requests/:id/acknowledge', requireAdminAccess,
  requirePermission(permissions.PRIVACY_REQUEST_MANAGE), async (req, res) => {
    const request = await PrivacyRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ success: false, message: 'Request not found.' });
    if (!request.acknowledgedAt) request.acknowledgedAt = new Date();
    request.status = 'ACKNOWLEDGED';
    await request.save();
    await recordAuditEvent({
      actorId: req.session.user._id,
      actorRole: 'data_protection_officer',
      action: 'privacy:request:acknowledge',
      resourceType: 'PrivacyRequest',
      resourceId: request._id,
      correlationId: String(request._id)
    });
    return res.json({ success: true, acknowledgedAt: request.acknowledgedAt });
  });

router.post('/privacy/dpo/requests/:id/complete', requireAdminAccess,
  requirePermission(permissions.PRIVACY_REQUEST_MANAGE), async (req, res) => {
    const outcome = req.body.outcome;
    const decisionCode = String(req.body.decisionCode || '');
    if (!['completed', 'refused'].includes(outcome) ||
        !/^[A-Z0-9_-]{1,40}$/.test(decisionCode)) {
      return res.status(400).json({ success: false, message: 'A valid outcome and decision code are required.' });
    }
    const request = await PrivacyRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ success: false, message: 'Request not found.' });
    const completedAt = new Date();
    await recordAuditEvent({
      actorId: req.session.user._id,
      actorRole: 'data_protection_officer',
      action: outcome === 'completed' ? 'privacy:request:completed' : 'privacy:request:refused',
      resourceType: 'PrivacyRequest',
      resourceId: request._id,
      result: outcome === 'completed' ? 'SUCCESS' : 'REJECTED',
      reasonCode: decisionCode,
      correlationId: String(request._id)
    });
    request.status = outcome === 'completed' ? 'COMPLETED' : 'REFUSED';
    request.decisionCode = decisionCode;
    request.completedAt = completedAt;
    if (!request.acknowledgedAt) request.acknowledgedAt = completedAt;
    await request.save();
    return res.json({
      success: true,
      status: request.status,
      completedAt: request.completedAt
    });
  });

router.post('/privacy/dpo/requests/:id/recalculate', requireAdminAccess,
  requirePermission(permissions.PRIVACY_REQUEST_MANAGE), async (req, res) => {
    const reason = String(req.body.reason || '').trim();
    if (reason.length < 10 || reason.length > 300) {
      return res.status(400).json({ success: false, message: 'Provide a reason of 10 to 300 characters.' });
    }
    const request = await PrivacyRequest.findById(req.params.id);
    if (!request || ['COMPLETED', 'REFUSED'].includes(request.status)) {
      return res.status(404).json({ success: false, message: 'Open request not found.' });
    }
    const deadlines = calculatePrivacyDeadlines(
      request.receivedAt,
      await activeCalendarsByYear()
    );
    request.deadlineChanges.push({
      changedAt: new Date(),
      actorId: req.session.user._id,
      reason: reason.replace(/[^\w .,:;()-]/g, '').slice(0, 300),
      previousAcknowledgementDueAt: request.acknowledgementDueAt,
      newAcknowledgementDueAt: deadlines.acknowledgementDueAt,
      previousCompletionDueAt: request.completionDueAt,
      newCompletionDueAt: deadlines.completionDueAt,
      calendarVersions: [...new Set([
        ...deadlines.acknowledgementCalendarVersions,
        ...deadlines.completionCalendarVersions
      ])]
    });
    request.acknowledgementDueAt = deadlines.acknowledgementDueAt;
    request.completionDueAt = deadlines.completionDueAt;
    request.acknowledgementCalendarVersions = deadlines.acknowledgementCalendarVersions;
    request.completionCalendarVersions = deadlines.completionCalendarVersions;
    await recordAuditEvent({
      actorId: req.session.user._id,
      actorRole: 'data_protection_officer',
      action: 'privacy:request:deadline-recalculate',
      resourceType: 'PrivacyRequest',
      resourceId: request._id,
      reasonCode: 'AUTHORIZED_POLICY_CHANGE',
      correlationId: String(request._id)
    });
    await request.save();
    return res.json({
      success: true,
      acknowledgementDueAt: request.acknowledgementDueAt,
      completionDueAt: request.completionDueAt
    });
  });

router.post('/privacy/dpo/calendars/:year', requireAdminAccess,
  requirePermission(permissions.PRIVACY_REQUEST_MANAGE), async (req, res) => {
    const year = Number(req.params.year);
    const { version, operatingLocation, sourceReference, publishedAt, holidays } = req.body;
    if (!Number.isInteger(year) || year < 2020 || year > 2200 ||
        typeof version !== 'string' || !version.trim() ||
        typeof operatingLocation !== 'string' || !operatingLocation.trim() ||
        typeof sourceReference !== 'string' || !sourceReference.trim() ||
        !Array.isArray(holidays) ||
        holidays.some(holiday => !/^\d{4}-\d{2}-\d{2}$/.test(holiday.date) ||
          Number(holiday.date.slice(0, 4)) !== year ||
          typeof holiday.name !== 'string' ||
          !['regular', 'special-non-working', 'local', 'office-closure'].includes(holiday.type))) {
      return res.status(400).json({ success: false, message: 'Holiday calendar details are invalid.' });
    }
    const calendar = await HolidayCalendar.create({
      year,
      version: version.trim(),
      operatingLocation: operatingLocation.trim(),
      sourceReference: sourceReference.trim(),
      publishedAt: publishedAt ? new Date(publishedAt) : new Date(),
      timeZone: 'Asia/Manila',
      holidays
    });
    await recordAuditEvent({
      actorId: req.session.user._id,
      actorRole: 'data_protection_officer',
      action: 'privacy:holiday-calendar:publish',
      resourceType: 'HolidayCalendar',
      resourceId: calendar._id,
      reasonCode: 'OFFICIAL_CALENDAR'
    });
    return res.status(201).json({ success: true, year: calendar.year, version: calendar.version });
  });

module.exports = router;
