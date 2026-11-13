// routes/admin.js
const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const Flight = require('../models/Flight');
const User = require('../models/User');
const Reservation = require('../models/Reservation');
const AuditLog = require('../models/AuditLog');
const AdminApprovalRequest = require('../models/AdminApprovalRequest');
const EmergencyAccessGrant = require('../models/EmergencyAccessGrant');
const {
  BookingInputError,
  validateObjectId,
  assertSafeKeys,
  assertAllowedKeys
} = require('../services/bookingValidation');
const {
  BookingConflictError,
  cancelReservation
} = require('../services/bookingService');
const logger = require('../logs/logger');
const { permissions, getEffectivePermissions } = require('../config/rbac');
const { requireAdminAccess, requirePermission, requireStepUpAuthentication } = require('../middleware/adminAuth');
const { cancellationLimits } = require('../middleware/rateLimits');
const { recordAuditEvent } = require('../services/auditService');
const { getAdminNavigation } = require('../services/adminNavigation');

/* ======================================================
   Admin Access Middleware
====================================================== */
router.use(requireAdminAccess);
router.use((req, res, next) => {
  res.locals.admin = req.authenticatedUser;
  res.locals.user = req.authenticatedUser;
  Object.assign(res.locals, getAdminNavigation(req.authenticatedUser));
  return next();
});

/* ======================================================
  Dashboard Route 
====================================================== */
router.get('/', async (req, res) => {
  try {
    const admin = req.authenticatedUser;
    const adminPermissions = new Set(getEffectivePermissions(admin));
    const [totalFlights, totalUsers, totalReservations, activities] = await Promise.all([
      adminPermissions.has(permissions.FLIGHT_READ) ? Flight.countDocuments() : null,
      adminPermissions.has(permissions.USER_CREATE) || adminPermissions.has(permissions.USER_UPDATE)
        ? User.countDocuments()
        : null,
      adminPermissions.has(permissions.RESERVATION_READ) ? Reservation.countDocuments() : null,
      adminPermissions.has(permissions.AUDIT_READ)
        ? AuditLog.find({ resourceType: 'Administrator' })
          .sort({ timestamp: -1 })
          .limit(5)
          .select('action resourceId timestamp details')
          .lean()
        : []
    ]);

    res.render('admin/dashboard', {
      layout: 'admin',
      title: 'Admin Dashboard',
      admin,
      assignedRoles: (admin.roles || []).map((roleName) => roleName
        .split('_')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ')),
      accountStatusLabel: admin.status === 'active' ? 'Active' : 'Inactive',
      activities,
      stats: {
        totalFlights: totalFlights === null ? '—' : totalFlights,
        totalUsers: totalUsers === null ? '—' : totalUsers < 5 ? '<5' : totalUsers,
        totalReservations: totalReservations === null ? '—' : totalReservations < 5 ? '<5' : totalReservations
      }
    });
  } catch (err) {
    logger.error('Admin dashboard request failed.', { code: err.code || 'ADMIN_DASHBOARD_ERROR' });
    res.status(500).render('error/server-error');
  }
});

router.get('/profile', async (req, res) => {
  try {
    const account = await User.findById(req.authenticatedUser._id)
      .select('firstName lastName email role roles permissions status createdAt lastLoginAt isProvisionedAdmin');
    if (!account) {
      return res.status(404).render('error/access-denied', {
        layout: 'admin',
        title: 'Profile Not Found',
        message: 'Administrator account not found.'
      });
    }

    return res.render('admin/profile', {
      layout: 'admin',
      title: 'Administrator Profile',
      admin: account,
      roles: (account.roles || []).map((roleName) => roleName
        .split('_')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ')),
      permissions: getEffectivePermissions(account),
      statusLabel: account.status === 'active' ? 'Active' : 'Inactive',
      successMessage: req.query.updated === 'true' ? 'Your profile was updated.' : ''
    });
  } catch (error) {
    logger.error('Administrator profile request failed.', { code: error.code || 'ADMIN_PROFILE_ERROR' });
    return res.status(500).render('error/server-error', { layout: 'admin', title: 'Administrator Profile Error' });
  }
});

router.post('/profile', async (req, res) => {
  const allowedFields = new Set(['_csrf', 'firstName', 'lastName', 'email']);
  if (Object.keys(req.body).some((field) => !allowedFields.has(field))) {
    return res.status(400).render('error/access-denied', {
      layout: 'admin',
      title: 'Invalid Profile Update',
      message: 'Only your name and email address can be updated here.'
    });
  }

  const firstName = typeof req.body.firstName === 'string' ? req.body.firstName.trim() : '';
  const lastName = typeof req.body.lastName === 'string' ? req.body.lastName.trim() : '';
  const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  if (!/^[\p{L}][\p{L}\p{M}' -]{0,79}$/u.test(firstName) ||
      !/^[\p{L}][\p{L}\p{M}' -]{0,79}$/u.test(lastName) ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).render('admin/profile', {
      layout: 'admin',
      title: 'Administrator Profile',
      admin: req.authenticatedUser,
      roles: req.authenticatedUser.roles || [],
      permissions: getEffectivePermissions(req.authenticatedUser),
      statusLabel: req.authenticatedUser.status === 'active' ? 'Active' : 'Inactive',
      errorMessage: 'Enter a valid first name, last name, and email address.'
    });
  }

  try {
    const account = await User.findById(req.authenticatedUser._id);
    if (!account) return res.status(404).render('error/access-denied', { layout: 'admin', title: 'Profile Not Found' });
    const changedFields = [];
    if (account.firstName !== firstName) changedFields.push('firstName');
    if (account.lastName !== lastName) changedFields.push('lastName');
    if (account.email !== email) changedFields.push('email');
    account.firstName = firstName;
    account.lastName = lastName;
    account.email = email;
    if (req.authenticatedUser.isProvisionedAdmin) account.isProvisionedAdmin = true;
    await account.save();

    req.session.user = {
      ...req.session.user,
      firstName: account.firstName,
      lastName: account.lastName,
      email: account.email
    };
    await recordAuditEvent({
      actorId: account._id,
      actorRole: account.role,
      action: 'admin:profile:update',
      resourceType: 'Administrator',
      resourceId: account._id,
      details: { changedFields }
    });
    return res.redirect('/admin/profile?updated=true');
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).render('admin/profile', {
        layout: 'admin',
        title: 'Administrator Profile',
        admin: req.authenticatedUser,
        roles: req.authenticatedUser.roles || [],
        permissions: getEffectivePermissions(req.authenticatedUser),
        statusLabel: req.authenticatedUser.status === 'active' ? 'Active' : 'Inactive',
        errorMessage: 'An account already uses that email address.'
      });
    }
    logger.error('Administrator profile update failed.', { code: error.code || 'ADMIN_PROFILE_UPDATE_ERROR' });
    return res.status(500).render('error/server-error', { layout: 'admin', title: 'Administrator Profile Error' });
  }
});

/* ======================================================
   Edit Flight Page
====================================================== */
router.get('/edit/:id', requirePermission(permissions.FLIGHT_UPDATE), async (req, res) => {
  try {
    const flight = await Flight.findById(req.params.id).lean();

    if (!flight) {
      return res.status(404).render('error/404', {
        layout: 'admin',
        title: 'Flight Not Found'
      });
    }

    res.render('admin/edit', {
      layout: 'admin',
      title: 'Edit Flight',
      flight
    });

  } catch (err) {
    logger.error('Flight edit page request failed.', { code: err.code || 'FLIGHT_EDIT_PAGE_ERROR' });
    res.status(500).render('error/server-error');
  }
});

/* ======================================================
   Create Flight Page
====================================================== */
router.get('/create', requirePermission(permissions.FLIGHT_CREATE), (req, res) => {
  res.render('admin/create', {
    layout: 'admin',
    title: 'Create New Flight'
  });
});

/* ======================================================
  Get All Flights
====================================================== */
router.get('/flights', requirePermission(permissions.FLIGHT_READ), async (req, res) => {
  try {
    const flights = await Flight.find().lean();

    // JSON response for AJAX
    if (req.xhr || req.headers.accept.includes('json')) {
      return res.status(200).json(flights);
    }

    res.render('admin/list', {
      layout: 'admin',
      title: 'All Flights',
      flights
    });

  } catch (error) {
    logger.error('Flight list request failed.', { code: error.code || 'FLIGHT_LIST_ERROR' });
    res.status(500).json({ message: 'Error retrieving flights' });
  }
});

/* ======================================================
   Flight Search by FlightNumber
====================================================== */
router.get('/flights/:flightNumber', requirePermission(permissions.FLIGHT_READ), async (req, res) => {
  try {
    const flight = await Flight.findOne({ flightNumber: req.params.flightNumber }).lean();

    if (!flight) return res.status(404).json({ message: 'Flight not found.' });

    res.json({
      success: true,
      flightNumber: flight.flightNumber,
      origin: flight.origin,
      destination: flight.destination,
      date: flight.departureDate,
      price: flight.price
    });

  } catch (err) {
    logger.error('Flight search request failed.', { code: err.code || 'ADMIN_FLIGHT_SEARCH_ERROR' });
    res.status(500).json({ message: 'Error retrieving flight' });
  }
});

/* ======================================================
  Create Flight API
====================================================== */
router.post('/create', requirePermission(permissions.FLIGHT_CREATE), async (req, res) => {
  try {
    let flight = new Flight(req.body);
    const saved = await flight.save();

    res.status(201).json({
      message: 'Flight created successfully.',
      flight: saved
    });

    logger.info('Flight created successfully.');
  } catch (err) {
    logger.error('Flight creation failed.', { code: err.code || 'FLIGHT_CREATE_ERROR' });
    res.status(500).json({ message: 'Error creating flight.' });
  }
});

/* ======================================================
   Update Flight
====================================================== */
router.put('/update/:id', requirePermission(permissions.FLIGHT_UPDATE), async (req, res) => {
  try {
    const updatedFlight = await Flight.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    ).lean();

    if (!updatedFlight) {
      return res.status(404).json({ message: 'Flight not found.' });
    }

    res.json({ message: 'Flight updated successfully.', flight: updatedFlight });
    logger.info('Flight updated successfully.');

  } catch (err) {
    logger.error('Flight update failed.', { code: err.code || 'FLIGHT_UPDATE_ERROR' });
    res.status(500).json({ message: 'Error updating flight.' });
  }
});

/* ======================================================
   Delete Flight
====================================================== */
router.delete('/delete/:id', requirePermission(permissions.FLIGHT_DELETE), async (req, res) => {
  try {
    const deletedFlight = await Flight.findByIdAndDelete(req.params.id).lean();

    if (!deletedFlight) {
      return res.status(404).json({ message: 'Flight not found.' });
    }

    res.json({ message: 'Flight deleted successfully.' });
    logger.info('Flight deleted successfully.');

  } catch (err) {
    logger.error('Flight deletion failed.', { code: err.code || 'FLIGHT_DELETE_ERROR' });
    res.status(500).json({ message: 'Error deleting flight.' });
  }
});

/* ======================================================
   Reservations
====================================================== */
router.get('/reservations', requirePermission(permissions.RESERVATION_READ), async (req, res) => {
  try {
    const reservations = await Reservation.find()
      .populate('flight')
      .populate('userId')
      .lean();
    const safeReservations = reservations.map(reservation => ({
      ...reservation,
      passengers: reservation.passengers.map(passenger => ({
        _id: passenger._id,
        fullName: passenger.fullName,
        ageCategory: passenger.ageCategory,
        passportLast3: passenger.passportLast3
      }))
    }));

    res.render('admin/bookings', {
      layout: 'admin',
      title: 'All Reservations',
      reservations: safeReservations
    });
  } catch (error) {
    logger.error('Error retrieving reservations.', { code: error.code || 'RESERVATION_READ_ERROR' });
    res.status(500).json({ message: 'Error retrieving reservations' });
  }
});

// POST /admin/edit-reservation/:id 
router.post('/edit-reservation/:reservationId', ...cancellationLimits, requirePermission(permissions.RESERVATION_UPDATE), async (req, res) => {
  try{
    assertSafeKeys(req.body);
    assertAllowedKeys(req.body, new Set(['status']), 'Request');
    const reservationId = validateObjectId(req.params.reservationId, 'Reservation ID');
    const { status } = req.body;

    if (!['Confirmed', 'Pending', 'Cancelled'].includes(status)) {
      throw new BookingInputError('Reservation status is invalid.');
    }

    const reservation = await Reservation.findById(reservationId);
    if (!reservation) return res.status(404).send('Reservation not found');
    if (status === 'Cancelled') {
      await cancelReservation(reservation);
    } else {
      if (reservation.status === 'Cancelled') {
        throw new BookingConflictError('Cancelled reservations cannot be reactivated without a new seat allocation.');
      }
      await recordAuditEvent({
        actorId: req.session.user._id,
        actorRole: req.session.user.role || 'Admin',
        action: status === 'Cancelled' ? 'reservation:cancel' : 'reservation:status:update',
        resourceType: 'Reservation',
        resourceId: reservation._id
      });
      const result = await Reservation.updateOne(
        { _id: reservationId, __v: reservation.__v },
        { $set: { status }, $inc: { __v: 1 } }
      );
      if (result.modifiedCount !== 1) {
        throw new BookingConflictError('Reservation changed; reload and try again.');
      }
    }
    res.json({ 
      success: true, 
      message: 'Reservation updated successfully!'
    });
  }catch (err) {
    if (err instanceof BookingInputError || err instanceof BookingConflictError) {
      return res.status(err.statusCode).json({ success: false, message: err.message });
    }
    logger.error('Admin reservation update failed.', { code: err.code || 'ADMIN_RESERVATION_UPDATE_ERROR' });
    res.status(500).send('Server error during Reservation update');
  }
});

// POST /admin/delete-reservation/:reservationId
router.post('/delete-reservation/:reservationId', ...cancellationLimits, requirePermission(permissions.RESERVATION_CANCEL), async (req, res) => {
  try {
    const reservationId = validateObjectId(req.params.reservationId, 'Reservation ID');
    const reservation = await Reservation.findById(reservationId);
    if (!reservation) return res.status(404).send('Reservation not found');
    await cancelReservation(reservation);
    await recordAuditEvent({
      actorId: req.session.user._id,
      actorRole: req.session.user.role || 'Admin',
      action: 'reservation:cancel',
      resourceType: 'Reservation',
      resourceId: reservation._id
    });
    res.json({
      success: true,
      message: 'Reservation cancelled. Transaction records remain subject to the five-year retention period.'
    });
  } catch (error) {
    if (error instanceof BookingInputError || error instanceof BookingConflictError) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    logger.error('Admin reservation deletion failed.', { code: error.code || 'ADMIN_RESERVATION_DELETE_ERROR' });
    res.status(500).send('Server error during Reservation deletion');
  }
});

// GET /admin/security - Security Center
router.get('/security', requirePermission(permissions.SECURITY_REVIEW), async (req, res) => {
  try {
    const approvals = await AdminApprovalRequest.find({ status: 'PENDING_APPROVAL' }).sort({ createdAt: -1 }).limit(10).lean();
    const emergency = await EmergencyAccessGrant.find({ status: 'PENDING_APPROVAL' }).sort({ createdAt: -1 }).limit(10).lean();

    res.render('admin/security', {
      layout: 'admin',
      title: 'Security Center',
      approvals,
      emergency,
      user: req.session.user
    });
  } catch (error) {
    logger.error('Security center request failed.', { code: error.code || 'SECURITY_CENTER_ERROR' });
    res.status(500).render('error/server-error', { layout: 'admin', title: 'Security Error' });
  }
});

router.get('/approvals', requirePermission(permissions.ADMIN_ROLE_ASSIGN), async (req, res) => {
  try {
    const approvals = await AdminApprovalRequest.find().sort({ createdAt: -1 }).lean();

    res.render('admin/approvals', {
      layout: 'admin',
      title: 'Approval Queue',
      approvals,
      user: req.session.user
    });
  } catch (error) {
    logger.error('Approval page request failed.', { code: error.code || 'APPROVAL_PAGE_ERROR' });
    res.status(500).render('error/server-error', { layout: 'admin', title: 'Approval Queue Error' });
  }
});

// GET /admin/emergency-access - Emergency Access Page
router.get('/emergency-access', requirePermission(permissions.SECURITY_REVIEW), async (req, res) => {
  try {
    const grants = await EmergencyAccessGrant.find().sort({ createdAt: -1 }).lean();

    res.render('admin/emergency-access', {
      layout: 'admin',
      title: 'Emergency Access',
      grants,
      user: req.session.user
    });
  } catch (error) {
    logger.error('Emergency access page request failed.', { code: error.code || 'EMERGENCY_ACCESS_PAGE_ERROR' });
    res.status(500).render('error/server-error', { layout: 'admin', title: 'Emergency Access Error' });
  }
});

// POST /admin/sensitive-test - Test Step-Up Authentication
router.post('/sensitive-test', requirePermission(permissions.FLIGHT_UPDATE), requireStepUpAuthentication([permissions.FLIGHT_UPDATE], 5 * 60 * 1000), async (req, res) => {
  res.status(200).json({ success: true, message: 'Step-up authentication verified.' });
});


// POST /admin/approvals - Create Approval Request
router.post('/approvals', requirePermission(permissions.ADMIN_ROLE_ASSIGN), async (req, res) => {
  try {
    const { action, resourceType = 'system', resourceId = '', payload = {}, reason = '', amount = 0 } = req.body;

    if (!action) {
      return res.status(400).json({ success: false, message: 'Action is required.' });
    }

    const requestedBy = req.session.user._id;
    const requiredApprovals = Number(amount) > 5000 ? 2 : 1;
    const payloadHash = crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
    const request = await AdminApprovalRequest.create({
      requesterId: requestedBy,
      action,
      resourceType,
      resourceId,
      payload,
      totalAmount: Number(amount) || 0,
      payloadHash,
      requiredApprovals,
      reason,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      status: 'PENDING_APPROVAL'
    });

    res.status(202).json({
      success: true,
      approvalId: request._id,
      status: request.status,
      requiredApprovals,
      expiresAt: request.expiresAt
    });
  } catch (error) {
    logger.error('Approval request creation failed.', { code: error.code || 'APPROVAL_CREATE_ERROR' });
    res.status(500).json({ success: false, message: 'Unable to create approval request.' });
  }
});

// POST /admin/approvals/:approvalId/approve - Approve an Admin Approval Request
router.get('/approvals', requirePermission(permissions.ADMIN_ROLE_ASSIGN), async (req, res) => {
  try {
    const approvals = await AdminApprovalRequest.find({
      status: 'PENDING_APPROVAL'
    }).sort({ createdAt: -1 }).lean();

    res.status(200).json({ success: true, approvals });
  } catch (error) {
    logger.error('Approval retrieval failed.', { code: error.code || 'APPROVAL_READ_ERROR' });
    res.status(500).json({ success: false, message: 'Unable to retrieve approvals.' });
  }
});

// POST /admin/approvals/:approvalId/approve - Approve an Admin Approval Request
router.post('/approvals/:approvalId/approve', requirePermission(permissions.ADMIN_ROLE_ASSIGN), requireStepUpAuthentication([permissions.ADMIN_ROLE_ASSIGN], 5 * 60 * 1000), async (req, res) => {
  try {
    const { approvalId } = req.params;
    const { comment = '' } = req.body;
    const approverId = req.session.user._id;

    const request = await AdminApprovalRequest.findById(approvalId);
    if (!request) {
      return res.status(404).json({ success: false, message: 'Approval request not found.' });
    }

    if (request.requesterId.toString() === approverId.toString()) {
      return res.status(403).json({ success: false, message: 'You cannot approve your own request.' });
    }

    if (request.status !== 'PENDING_APPROVAL') {
      return res.status(409).json({ success: false, message: 'This approval request is no longer pending.' });
    }

    if (new Date(request.expiresAt).getTime() < Date.now()) {
      request.status = 'EXPIRED';
      await request.save();
      return res.status(409).json({ success: false, message: 'This approval request has expired.' });
    }

    const alreadyApproved = request.approvals.some((entry) => entry.approverId.toString() === approverId.toString());
    if (alreadyApproved) {
      return res.status(409).json({ success: false, message: 'This approver has already acted on this request.' });
    }

    request.approvals.push({
      approverId,
      status: 'APPROVED',
      comment,
      approvedAt: new Date()
    });

    if (request.approvals.length >= request.requiredApprovals) {
      request.status = 'APPROVED';
      request.updatedAt = new Date();
    }

    await request.save();

    res.status(200).json({
      success: true,
      approvalId: request._id,
      status: request.status,
      approvals: request.approvals.length
    });
  } catch (error) {
    logger.error('Approval action failed.', { code: error.code || 'APPROVAL_ACTION_ERROR' });
    res.status(500).json({ success: false, message: 'Unable to approve request.' });
  }
});

// POST /admin/approvals/:approvalId/reject - Reject an Admin Approval Request
router.post('/emergency-access', requirePermission(permissions.SECURITY_REVIEW), async (req, res) => {
  try {
    const { reason = '', permissions: grantedPermissions = [], durationMinutes = 60 } = req.body;

    if (!reason || grantedPermissions.length === 0) {
      return res.status(400).json({ success: false, message: 'Emergency access reason and permissions are required.' });
    }

    const request = await EmergencyAccessGrant.create({
      requestedBy: req.session.user._id,
      reason,
      permissions: grantedPermissions,
      requiredApprovals: 2,
      expiresAt: new Date(Date.now() + Number(durationMinutes || 60) * 60 * 1000),
      status: 'PENDING_APPROVAL'
    });

    res.status(202).json({ success: true, grantId: request._id, status: request.status });
  } catch (error) {
    logger.error('Emergency access request failed.', { code: error.code || 'EMERGENCY_ACCESS_CREATE_ERROR' });
    res.status(500).json({ success: false, message: 'Unable to create emergency access request.' });
  }
});

// POST /admin/emergency-access/:grantId/approve - Approve an Emergency Access Request
router.post('/emergency-access/:grantId/approve', requirePermission(permissions.SECURITY_REVIEW), requireStepUpAuthentication([permissions.SECURITY_REVIEW], 5 * 60 * 1000), async (req, res) => {
  try {
    const { grantId } = req.params;
    const approverId = req.session.user._id;

    const grant = await EmergencyAccessGrant.findById(grantId);
    if (!grant) {
      return res.status(404).json({ success: false, message: 'Emergency access grant not found.' });
    }

    if (grant.requestedBy.toString() === approverId.toString()) {
      return res.status(403).json({ success: false, message: 'The requester cannot approve their own emergency access.' });
    }

    const alreadyApproved = grant.approvals.some((entry) => entry.approverId.toString() === approverId.toString());
    if (alreadyApproved) {
      return res.status(409).json({ success: false, message: 'This approver has already approved this grant.' });
    }

    grant.approvals.push({ approverId, role: req.session.user.role || 'custodian', approvedAt: new Date() });
    if (grant.approvals.length >= grant.requiredApprovals) {
      grant.status = 'APPROVED';
      grant.startedAt = new Date();
    }
    await grant.save();

    res.status(200).json({ success: true, grantId: grant._id, status: grant.status, approvals: grant.approvals.length });
  } catch (error) {
    logger.error('Emergency approval failed.', { code: error.code || 'EMERGENCY_APPROVAL_ERROR' });
    res.status(500).json({ success: false, message: 'Unable to approve emergency access.' });
  }
});


// POST /admin/emergency-access/:grantId/revoke - Revoke an Emergency Access Request
router.post('/emergency-access/:grantId/revoke', requirePermission(permissions.SECURITY_REVIEW), async (req, res) => {
  try {
    const { grantId } = req.params;
    const grant = await EmergencyAccessGrant.findById(grantId);
    if (!grant) {
      return res.status(404).json({ success: false, message: 'Emergency access grant not found.' });
    }

    grant.status = 'REVOKED';
    grant.expiresAt = new Date();
    await grant.save();

    res.status(200).json({ success: true, grantId: grant._id, status: grant.status });
  } catch (error) {
    logger.error('Emergency access revocation failed.', { code: error.code || 'EMERGENCY_REVOKE_ERROR' });
    res.status(500).json({ success: false, message: 'Unable to revoke emergency access.' });
  }
});

router.use('/management', require('./adminManagement'));

// Export the router
module.exports = router;
