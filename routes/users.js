// routes/users.js
const express = require('express');
const mongoose = require('mongoose');
const crypto = require('crypto');
const User = require('../models/User');
const bcrypt = require('bcrypt');
const router = express.Router();
const logger = require('../logs/logger');
const Reservation = require('../models/Reservation');
const PrivacyRequest = require('../models/PrivacyRequest');
const { getEffectivePermissions, isAdminAccount } = require('../config/rbac');
const { isProvisionedAdminAccount } = require('../services/adminIdentity');
const {
  generateSecret,
  generateQrCodeDataUrl,
  verifyTokenCounter,
  buildOtpAuthUrl,
  encryptSecret,
  decryptSecret,
  generateRecoveryCodes,
  hashRecoveryCode,
  isMfaEnrollmentComplete
} = require('../services/mfa');
const { mfaVerificationLimits, recoveryCodeLimits } = require('../middleware/rateLimits');
const { recordAuditEvent } = require('../services/auditService');
const { isTodayOrFutureInManila } = require('../services/manilaDate');
const { supportsTransactions } = require('../services/bookingService');
const { authenticationLimits } = require('../middleware/rateLimits');

const INVALID_LOGIN_MESSAGE = 'Invalid email or password.';
const SESSION_IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const SESSION_ABSOLUTE_TIMEOUT_MS = 8 * 60 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000;

/** * Build a safe user object for session storage, excluding sensitive information.
 * @param {Object} user - The user object from the database.
 * @returns {Object} - A safe user object for session storage.
 */
function buildSessionUser(user) {
  const permissions = getEffectivePermissions(user);
  const status = user.status || 'active';
  const isAdmin = isAdminAccount(user);

  return {
    _id: user._id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    role: user.role,
    roles: Array.isArray(user.roles) ? user.roles : [],
    permissions,
    status,
    isProvisionedAdmin: isProvisionedAdminAccount(user),
    sessionVersion: Number(user.sessionVersion || 0),
    mfaEnabled: Boolean(user.mfaEnabled),
    isAdmin
  };
}

/** * Normalize an email address by trimming whitespace and converting to lowercase.
 * @param {string} email - The email address to normalize.
 * @returns {string} - The normalized email address.
 */
function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

/** * Check if a password meets the minimum strength requirements.
 * @param {string} password - The password to check.
 * @returns {boolean} - True if the password is strong, false otherwise.
 */
function isStrongPassword(password) {
  return typeof password === 'string' && password.trim().length >= 8;
}


/** * Check if a password meets the strong requirements for administrator setup.
 * @param {string} password - The password to check.
 * @returns {boolean} - True if the password is strong, false otherwise.
 */
function isStrongAdminSetupPassword(password) {
  return typeof password === 'string' &&
    password.length >= 12 &&
    /[a-z]/.test(password) &&
    /[A-Z]/.test(password) &&
    /\d/.test(password) &&
    /[^A-Za-z0-9]/.test(password);
}


/** * Build the MFA pending state for a user, including the stage and expiration time.
 * @param {string} userId - The ID of the user.
 * @param {string} stage - The stage of the MFA process (e.g., 'enroll', 'verify').
 * @returns {Object} - The MFA pending state object.
 */
function buildMfaPendingState(userId, stage = 'enroll') {
  const createdAt = Date.now();
  return {
    userId: String(userId),
    stage,
    createdAt,
    expiresAt: createdAt + 5 * 60 * 1000
  };
}


/** * Normalize the OTP input by removing whitespace and trimming.
 * @param {string} value - The OTP input to normalize.
 * @returns {string} - The normalized OTP input.
 */
function normalizeOtpInput(value) {
  return String(value || '').replace(/\s+/g, '').trim();
}


/** * Check if a user is an active administrator, meaning they have admin privileges and are not disabled or suspended.
 * @param {Object} user - The user object to check.
 * @returns {boolean} - True if the user is an active administrator, false otherwise.
 */
function isActiveAdministrator(user) {
  return Boolean(user && isAdminAccount(user) && user.status !== 'disabled' && user.status !== 'suspended');
}


/** * Check if the current session is pending MFA verification.
 * @param {Object} pending - The pending MFA state.
 * @param {string} stage - The stage of the MFA process.
 * @returns {boolean} - True if the session is pending MFA verification, false otherwise.
 */
function isLiveMfaPending(pending, stage) {
  return Boolean(pending && pending.stage === stage && Number(pending.expiresAt) > Date.now());
}


/** * Consume a recovery code for a user, removing it from the list of valid codes.   
 * @param {Object} user - The user object from the database.
 * @param {string} recoveryCode - The recovery code to consume.
 * @returns {Promise<boolean>} - True if the recovery code was consumed, false otherwise.
 */
async function consumeRecoveryCode(user, recoveryCode) {
  const hashedCode = hashRecoveryCode(recoveryCode);
  if (!Array.isArray(user.recoveryCodes) || !user.recoveryCodes.includes(hashedCode)) return false;

  const updatedUser = await User.findOneAndUpdate(
    { _id: user._id, recoveryCodes: hashedCode },
    { $pull: { recoveryCodes: hashedCode } },
    { new: true }
  ).select('recoveryCodes');
  if (!updatedUser) return false;

  user.recoveryCodes = updatedUser.recoveryCodes;
  return true;
}


/** * Consume a fresh TOTP token for a user, ensuring it hasn't been used before.
 * @param {Object} user - The user object from the database.
 * @param {string} encryptedSecret - The encrypted MFA secret.
 * @param {string} token - The TOTP token to consume.
 * @returns {Promise<boolean>} - True if the token was consumed, false otherwise.
 */
async function consumeFreshTotp(user, encryptedSecret, token) {
  const secret = decryptSecret(encryptedSecret);
  const counter = verifyTokenCounter(secret, token, { window: 1 });
  if (counter === null) return false;
  const secretHash = crypto.createHash('sha256').update(encryptedSecret).digest('hex');

  const result = await User.updateOne(
    {
      _id: user._id,
      $or: [
        { mfaLastUsedSecretHash: secretHash, mfaLastUsedCounter: { $lt: counter } },
        { mfaLastUsedSecretHash: { $ne: secretHash } }
      ]
    },
    { $set: { mfaLastUsedCounter: counter, mfaLastUsedSecretHash: secretHash } }
  );
  return result.modifiedCount === 1;
}


/** * Regenerate the session for a request, creating a new session ID and clearing old data.
 * @param {Object} req - The Express request object.
 * @returns {Promise} - A promise that resolves when the session is regenerated.
 */
function regenerateSession(req) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((error) => error ? reject(error) : resolve());
  });
}


/** * Set the authenticated session for a user, including MFA state and expiration times. 
 * @param {Object} req - The Express request object.
 * @param {Object} user - The user object from the database.
 * @param {Object} options - Options for setting the session.
 * @param {boolean} options.mfaAuthenticated - Whether the user has completed MFA authentication.
 */
function setAuthenticatedSession(req, user, { mfaAuthenticated = false } = {}) {
  const authenticatedAt = Date.now();
  req.session.user = {
    ...buildSessionUser(user),
    authenticatedAt,
    lastActivityAt: authenticatedAt,
    absoluteExpiresAt: authenticatedAt + SESSION_ABSOLUTE_TIMEOUT_MS
  };
  req.session.authenticatedAt = authenticatedAt;
  req.session.lastActivityAt = authenticatedAt;
  req.session.absoluteExpiresAt = authenticatedAt + SESSION_ABSOLUTE_TIMEOUT_MS;
  req.session.cookie.maxAge = SESSION_IDLE_TIMEOUT_MS;
  req.session.stepUp = mfaAuthenticated
    ? { verifiedAt: new Date(authenticatedAt).toISOString(), method: 'mfa' }
    : null;
  if (mfaAuthenticated) {
    req.session.mfaAuthenticated = true;
    req.session.mfaAuthenticatedAt = authenticatedAt;
  }
}


/** * Create an authenticated session for an administrator after successful MFA verification.
 * @param {Object} req - The Express request object.
 * @param {Object} user - The user object from the database.
 * @returns {Promise} - A promise that resolves when the session is created.
 */
async function createAuthenticatedAdminSession(req, user) {
  await regenerateSession(req);
  setAuthenticatedSession(req, user, { mfaAuthenticated: true });
  await new Promise((resolve, reject) => {
    req.session.save((error) => error ? reject(error) : resolve());
  });
}


/** * Clear expired MFA secrets for a user, removing any pending or replacement secrets that have expired.
 * @param {Object} user - The user object from the database.
 * @returns {Promise<void>}
 */
async function clearExpiredMfaSecrets(user) {
  const now = new Date();
  let changed = false;
  if (user.mfaPendingExpiresAt && user.mfaPendingExpiresAt <= now) {
    user.mfaPendingSecret = '';
    user.mfaPendingExpiresAt = null;
    changed = true;
  }
  if (user.mfaReplacementExpiresAt && user.mfaReplacementExpiresAt <= now) {
    user.mfaReplacementPendingSecret = '';
    user.mfaReplacementExpiresAt = null;
    user.mfaReplacementChallengeHash = '';
    changed = true;
  }
  if (changed) await user.save();
}

/** * Handle failed login attempts, incrementing the count and locking the account if necessary.
 * @param {Object} user - The user object from the database.
 * @returns {Promise<Object>} - An object containing lock status and failed attempts count.
 */
async function handleFailedLogin(user) {
  if (!user) return { locked: false, failedAttempts: 0 };

  const now = Date.now();
  const lockUntil = user.lockUntil ? new Date(user.lockUntil).getTime() : 0;

  if (lockUntil > now) {
    return { locked: true, failedAttempts: user.loginAttempts || MAX_LOGIN_ATTEMPTS };
  }

  const nextAttemptCount = (user.loginAttempts || 0) + 1;
  user.loginAttempts = nextAttemptCount;

  if (nextAttemptCount >= MAX_LOGIN_ATTEMPTS) {
    user.lockUntil = new Date(now + LOCKOUT_DURATION_MS);
    user.loginAttempts = MAX_LOGIN_ATTEMPTS;
    await user.save();
    return { locked: true, failedAttempts: MAX_LOGIN_ATTEMPTS };
  }

  await user.save();
  return { locked: false, failedAttempts: nextAttemptCount };
}

/** * Clear the failed login state for a user, resetting attempts and lock status.
 * @param {Object} user - The user object from the database.
 * @returns {Promise<void>}
 */
async function clearFailedLoginState(user) {
  if (!user) return;
  user.loginAttempts = 0;
  user.lockUntil = null;
  await user.save();
}

/** * Record an audit log entry for administrative actions.
 * @param {Object} params - Parameters for the audit log entry.
 * @param {string} params.actorId - ID of the user performing the action.
 * @param {string} params.actorRole - Role of the user performing the action.
 * @param {string} params.action - Action performed (e.g., 'admin:login').
 * @param {string} [params.resourceType='system'] - Type of resource affected (e.g., 'User', 'Flight').
 * @param {string} [params.resourceId=''] - ID of the resource affected.
 * @param {string} [params.result='SUCCESS'] - Result of the action ('SUCCESS' or 'FAILURE').
 * @param {string} [params.approvalId=''] - ID of any approval associated with the action.
 * @param {string} [params.reason=''] - Reason for failure, if applicable.
 * @param {string} [params.correlationId=''] - Correlation ID for tracing related actions.
 */
async function recordAuditLog({ actorId, actorRole, action, resourceType = 'system', resourceId = '', result = 'SUCCESS', approvalId = '', reason = '', correlationId = '' }) {
  return recordAuditEvent({
    actorId,
    actorRole,
    action,
    resourceType,
    resourceId,
    result,
    reasonCode: reason ? 'AUTH_EVENT' : '',
    correlationId
  });
}

// Middleware to check if user is authenticated
function isAuthenticated(req, res, next) {
    if (req.session.user) {
      if (req.session.user.status === 'disabled' || req.session.user.status === 'suspended') {
        return res.status(403).render('error/access-denied', {
          title: 'Access Denied',
          message: 'This account is disabled.'
        });
      }
      return next();
    }else {
      res.status(403).render('error/access-denied', { 
        title: 'Access Denied',
        isAdmin: req.session.user?.role === 'Admin'
      });  
    } 
}

// Middleware to ensure admin cannot access user routes
function isAdmin(req, res, next) {
    if (req.session.user && req.session.user.role === 'Admin') {
      return res.status(403).render('error/user-only', { 
        title: 'Access Denied',
        isAdmin: req.session.user?.role === 'Admin'
      });  
    }
    next();
}

// GET /users/admin-setup - Render the administrator setup page
router.get('/admin-setup', (req, res) => {
  return res.render('users/admin-setup', {
    layout: 'main',
    title: 'Set Up Administrator Account'
  });
});


// POST /users/admin-setup - Handle administrator account setup
router.post('/admin-setup', async (req, res) => {
  const { token, password, confirmPassword } = req.body;
  const renderSetup = (statusCode, errorMessage = '', successMessage = '', setupToken = '') => res.status(statusCode).render('users/admin-setup', {
    layout: 'main',
    title: 'Set Up Administrator Account',
    errorMessage,
    successMessage,
    setupToken
  });

  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{40,60}$/.test(token)) {
    return renderSetup(400, 'This administrator setup link is invalid or has expired.');
  }
  if (!isStrongAdminSetupPassword(password)) {
    return renderSetup(400, 'Use at least 12 characters with an uppercase letter, a lowercase letter, a number, and a symbol.', '', token);
  }
  if (password !== confirmPassword) {
    return renderSetup(400, 'The passwords do not match.', '', token);
  }

  try {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const user = await User.findOne({
      passwordSetupTokenHash: tokenHash,
      passwordSetupExpiresAt: { $gt: new Date() },
      mustSetPassword: true
    }).select('+passwordSetupTokenHash +passwordSetupExpiresAt');

    if (!user || user.status === 'disabled' || user.status === 'suspended') {
      return renderSetup(400, 'This administrator setup link is invalid, expired, or inactive.');
    }

    const passwordHash = await bcrypt.hash(password, await bcrypt.genSalt(12));
    const updatedUser = await User.findOneAndUpdate({
      _id: user._id,
      passwordSetupTokenHash: tokenHash,
      passwordSetupExpiresAt: { $gt: new Date() },
      mustSetPassword: true,
      status: { $nin: ['disabled', 'suspended'] }
    }, {
      $set: { password: passwordHash, mustSetPassword: false },
      $unset: { passwordSetupTokenHash: 1, passwordSetupExpiresAt: 1 }
    }, { new: true, runValidators: true }).select('_id role');
    if (!updatedUser) {
      return renderSetup(400, 'This administrator setup link is invalid or has already been used.');
    }

    await recordAuditEvent({
      actorId: updatedUser._id,
      actorRole: 'Admin',
      action: 'admin:account:setup',
      resourceType: 'Administrator',
      resourceId: updatedUser._id
    });

    return renderSetup(200, '', 'Your password is set. You can now sign in with your administrator email and password.');
  } catch (error) {
    logger.error('Administrator password setup failed.', { code: error.code || 'ADMIN_PASSWORD_SETUP_ERROR' });
    return renderSetup(500, 'Unable to set up this administrator account. Please try again or contact the account administrator.');
  }
});

// POST /users/register - Handle user registration
router.post('/register', ...authenticationLimits, async (req, res) => {
    const { firstName, lastName, email, password, isAdult, privacyNoticeAccepted } = req.body;

    const normalizedEmail = normalizeEmail(email);

    if (!firstName || !lastName || !normalizedEmail || isAdult !== true ||
        privacyNoticeAccepted !== true || !isStrongPassword(password)) {
      return res.status(400).json({ success: false, message: 'Please provide valid registration details. Passwords must be at least 8 characters long.' });
    }

    try {
      const existingUser = await User.findOne({ email: normalizedEmail }).lean();
      if (existingUser) {
        return res
        .status(400)
        .json({ success: false, message: 'Email already registered' });
      }

      const newUser = new User({
        firstName: String(firstName).trim(),
        lastName: String(lastName).trim(),
        email: normalizedEmail,
        password
      });

      await newUser.save();
      res.status(200).json({ success: true });
      logger.info('User registered.');
    } catch (err) {
      logger.error('Registration failed.', { code: err.code || 'REGISTRATION_ERROR' });
      const message = err && err.message ? err.message : 'Server error during registration';
      res.status(400).json({ success: false, message });
    }
});

// POST /users/login - Handle user login
router.post('/login', ...authenticationLimits, async (req, res) => {
    const email = normalizeEmail(req.body.email);
    const password = typeof req.body.password === 'string' ? req.body.password : '';

    try {
      const user = await User.findOne({ email });

      if (!user) {
        await recordAuditLog({ actorRole: 'anonymous', action: 'admin:login', resourceType: 'User', result: 'FAILURE', reason: 'User not found' });
        return res.status(401).json({ success: false, message: INVALID_LOGIN_MESSAGE });
      }

      if (user.status === 'disabled' || user.status === 'suspended') {
        await recordAuditLog({ actorId: user._id, actorRole: user.role || 'user', action: 'admin:login', resourceType: 'User', result: 'FAILURE', reason: 'Account disabled' });
        return res.status(403).json({ success: false, message: 'This account is not available.' });
      }

      const lockUntil = user.lockUntil ? new Date(user.lockUntil).getTime() : 0;
      if (lockUntil > Date.now()) {
        return res.status(403).json({ success: false, message: INVALID_LOGIN_MESSAGE });
      }

      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        await handleFailedLogin(user);
        await recordAuditLog({ actorId: user._id, actorRole: user.role || 'user', action: 'admin:login', resourceType: 'User', result: 'FAILURE', reason: 'Invalid password' });
        return res.status(401).json({ success: false, message: INVALID_LOGIN_MESSAGE });
      }

      await clearFailedLoginState(user);
      await clearExpiredMfaSecrets(user);
      user.lastLoginAt = new Date();
      await user.save();

      const wantsHtml = req.accepts('html')
        && !req.xhr
        && String(req.get('accept') || '').includes('text/html');
      const isAdmin = isAdminAccount(user);
      const hasMfaEnrollment = isMfaEnrollmentComplete(user);
      const pendingStage = hasMfaEnrollment ? 'verify' : 'enroll';

      await regenerateSession(req);

      // If the user is an admin and MFA is required, set up the pending MFA state
      if (isAdmin) {
        const pending = buildMfaPendingState(user._id, pendingStage);
        req.session.mfaPending = pending;
        req.session.cookie.maxAge = Math.max(1, pending.expiresAt - Date.now());
        await new Promise((resolve, reject) => {
          req.session.save((error) => error ? reject(error) : resolve());
        });
        const redirect = `/users/mfa/${pendingStage}`;
        logger.info('Administrator password authentication completed; MFA is pending.');
        if (wantsHtml) return res.redirect(redirect);
        return res.status(200).json({
          success: true,
          isAdmin: true,
          mfaRequired: true,
          nextAction: pendingStage,
          redirect,
          message: `Welcome, ${user.firstName}! Complete MFA to continue.`
        });
      }

      setAuthenticatedSession(req, user);
      await new Promise((resolve, reject) => {
        req.session.save((error) => error ? reject(error) : resolve());
      });
      logger.info('User authenticated.');

      if (wantsHtml) return res.redirect('/');
      return res.status(200).json({
        success: true,
        isAdmin: false,
        mfaRequired: false,
        redirect: null,
        message: `Welcome, ${user.firstName}!`
      });

    } catch (err) {
      logger.error('Login failed.', { code: err.code || 'LOGIN_ERROR' });
      res.status(500).json({ success: false, message: 'Server error during login' });
    }
});

router.get('/mfa/enroll', async (req, res) => {
  const pending = req.session && req.session.mfaPending;
  if (!pending || pending.stage !== 'enroll') {
    return res.redirect('/');
  }

  if (!isLiveMfaPending(pending, 'enroll')) {
    req.session.destroy((error) => {
      if (error) logger.error('Expired MFA session cleanup failed.', { code: error.code || 'MFA_SESSION_CLEANUP_ERROR' });
      return res.redirect('/?mfaExpired=true');
    });
    return;
  }

  const user = await User.findById(pending.userId);
  if (!isActiveAdministrator(user)) {
    return res.status(403).render('error/access-denied', { title: 'Access Denied', message: 'Administrative access required.' });
  }

  if (isMfaEnrollmentComplete(user)) {
    pending.stage = 'verify';
    return res.redirect('/users/mfa/verify');
  }

  await clearExpiredMfaSecrets(user);
  let secret = user.mfaPendingSecret ? decryptSecret(user.mfaPendingSecret) : '';
  if (!secret) {
    secret = generateSecret();
    user.mfaPendingSecret = encryptSecret(secret);
  }
  user.mfaPendingExpiresAt = new Date(pending.expiresAt);
  await user.save();

  const qrCode = await generateQrCodeDataUrl(user.email, secret);
  return res.render('users/mfa-enroll', {
    layout: 'main',
    title: 'Secure Your Administrator Account',
    email: user.email,
    secret,
    otpauthUrl: buildOtpAuthUrl(user.email, secret),
    qrCode
  });
});


router.get('/mfa/verify', async (req, res) => {
  const pending = req.session && req.session.mfaPending;
  if (!pending || pending.stage !== 'verify') {
    return res.redirect('/');
  }

  if (!isLiveMfaPending(pending, 'verify')) {
    req.session.destroy((error) => {
      if (error) logger.error('Expired MFA session cleanup failed.', { code: error.code || 'MFA_SESSION_CLEANUP_ERROR' });
      return res.redirect('/?mfaExpired=true');
    });
    return;
  }

  const user = await User.findById(pending.userId);
  if (!isActiveAdministrator(user)) {
    return res.status(403).render('error/access-denied', { title: 'Access Denied', message: 'Administrative access required.' });
  }

  if (!isMfaEnrollmentComplete(user)) {
    pending.stage = 'enroll';
    return res.redirect('/users/mfa/enroll');
  }

  return res.render('users/mfa-verify', {
    layout: 'main',
    title: 'Verify Your Identity',
    email: user.email,
    isAdmin: true
  });
});


router.get('/mfa/setup', async (req, res) => {
  const pending = req.session && req.session.mfaPending;
  if (!isLiveMfaPending(pending, 'enroll')) {
    return res.status(403).json({ success: false, message: 'MFA enrollment is required.' });
  }

  const user = await User.findById(pending.userId);
  if (!isActiveAdministrator(user) || isMfaEnrollmentComplete(user)) {
    return res.status(403).json({ success: false, message: 'Administrative access required.' });
  }

  await clearExpiredMfaSecrets(user);
  let secret = user.mfaPendingSecret ? decryptSecret(user.mfaPendingSecret) : '';
  if (!secret) {
    secret = generateSecret();
    user.mfaPendingSecret = encryptSecret(secret);
  }
  user.mfaPendingExpiresAt = new Date(pending.expiresAt);
  await user.save();

  const qrCode = await generateQrCodeDataUrl(user.email, secret);
  return res.status(200).json({
    success: true,
    secret,
    otpauthUrl: buildOtpAuthUrl(user.email, secret),
    qrCode,
    nextAction: 'enroll'
  });
});



router.post('/mfa/setup/confirm', ...mfaVerificationLimits, async (req, res) => {
  const pending = req.session && req.session.mfaPending;
  if (!isLiveMfaPending(pending, 'enroll')) {
    return res.status(401).json({ success: false, code: 'MFA_PENDING_EXPIRED', message: 'Your MFA setup session expired. Sign in again.' });
  }

  const token = normalizeOtpInput(req.body.token);
  const user = await User.findById(pending.userId);
  if (!isActiveAdministrator(user) || isMfaEnrollmentComplete(user)) {
    return res.status(403).json({ success: false, message: 'Administrative access required.' });
  }

  await clearExpiredMfaSecrets(user);
  if (!user.mfaPendingExpiresAt || user.mfaPendingExpiresAt <= new Date()) {
    return res.status(401).json({ success: false, code: 'MFA_PENDING_EXPIRED', message: 'Your MFA setup session expired. Sign in again.' });
  }

  const pendingSecret = decryptSecret(user.mfaPendingSecret);
  if (!pendingSecret) {
    return res.status(400).json({ success: false, message: 'MFA enrollment secret is unavailable.' });
  }

  if (!await consumeFreshTotp(user, user.mfaPendingSecret, token)) {
    await recordAuditLog({ actorId: user._id, actorRole: 'Admin', action: 'admin:mfa:enroll', resourceType: 'User', result: 'FAILURE', reason: 'Invalid or reused enrollment code' });
    return res.status(400).json({ success: false, message: 'The verification code was invalid.' });
  }

  const recoveryCodes = generateRecoveryCodes(10);
  const encryptedPendingSecret = user.mfaPendingSecret;
  user.mfaEnabled = true;
  user.mfaPendingSecret = '';
  user.mfaPendingExpiresAt = null;
  user.mfaSecret = encryptedPendingSecret;
  user.mfaEnrolledAt = new Date();
  user.lastMfaVerifiedAt = new Date();
  user.recoveryCodes = recoveryCodes.map((code) => hashRecoveryCode(code));
  await user.save();

  await recordAuditLog({ actorId: user._id, actorRole: user.role || 'Admin', action: 'admin:mfa:enroll', resourceType: 'User', result: 'SUCCESS', reason: 'MFA enrollment complete' });
  await createAuthenticatedAdminSession(req, user);

  return res.status(200).json({
    success: true,
    message: 'MFA enrollment complete.',
    recoveryCodes,
    redirect: '/admin'
  });
});



router.post('/mfa/verify', ...mfaVerificationLimits, ...recoveryCodeLimits, async (req, res) => {
  const pending = req.session && req.session.mfaPending;
  if (!isLiveMfaPending(pending, 'verify')) {
    return res.status(401).json({ success: false, code: 'MFA_PENDING_EXPIRED', message: 'Your MFA verification session expired. Sign in again.' });
  }

  const token = normalizeOtpInput(req.body.token);
  const recoveryCode = typeof req.body.recoveryCode === 'string' ? req.body.recoveryCode.trim() : '';

  const user = await User.findById(pending.userId);
  if (!isActiveAdministrator(user)) {
    return res.status(403).json({ success: false, message: 'Administrative access required.' });
  }

  if (!isMfaEnrollmentComplete(user)) {
    return res.status(400).json({ success: false, code: 'MFA_REQUIRED', message: 'MFA is not configured for this account.' });
  }

  let isValid = false;
  let usedRecovery = false;

  if (token) {
    isValid = await consumeFreshTotp(user, user.mfaSecret, token);
  }

  if (!isValid && recoveryCode) {
    isValid = await consumeRecoveryCode(user, recoveryCode);
    usedRecovery = isValid;
  }

  if (!isValid) {
    await recordAuditLog({
      actorId: user._id,
      actorRole: 'Admin',
      action: recoveryCode ? 'admin:mfa:recovery:rejected' : 'admin:mfa:verify',
      resourceType: 'User',
      result: 'FAILURE',
      reason: recoveryCode ? 'Recovery code rejected' : 'Invalid or reused MFA code'
    });
    return res.status(400).json({ success: false, message: 'Invalid or expired MFA code.' });
  }

  user.lastMfaVerifiedAt = new Date();
  await user.save();
  await recordAuditLog({
    actorId: user._id,
    actorRole: 'Admin',
    action: usedRecovery ? 'admin:mfa:recovery:used' : 'admin:mfa:verify',
    resourceType: 'User',
    result: 'SUCCESS',
    reason: usedRecovery ? 'Recovery code accepted' : 'MFA verification succeeded'
  });
  await createAuthenticatedAdminSession(req, user);
  return res.status(200).json({ success: true, isAdmin: true, redirect: '/admin', message: 'MFA verification succeeded.' });
});

router.post('/mfa/cancel', (req, res) => {
  if (!req.session?.mfaPending) {
    return res.status(400).json({ success: false, message: 'There is no pending MFA sign-in.' });
  }
  req.session.destroy((error) => {
    if (error) {
      logger.error('MFA sign-in cancellation failed.', { code: error.code || 'MFA_CANCEL_ERROR' });
      return res.status(500).json({ success: false, message: 'Unable to cancel sign-in.' });
    }
    res.clearCookie('connect.sid', { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' });
    return res.status(200).json({ success: true, redirect: '/' });
  });
});

// POST /users/logout - Handle user logout
router.post('/logout', isAuthenticated, (req, res) => {
    req.session.stepUp = null;
    req.session.destroy(err => {
      if (err) {
        logger.error('Logout failed.', { code: err.code || 'LOGOUT_ERROR' });
        return res.status(500).json({ success: false, message: 'Server error during logout' });
      }
      res.clearCookie('connect.sid', { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' });
      res.status(200).json({ success: true });
    });
});

// GET /users/profile - Display user profile
router.get('/profile', isAuthenticated, (req, res) => {
    if (!req.session.user) {
      return res.redirect('/'); // redirect to home if not logged in
    }
  
    res.render('users/profile', {
      title: 'User Profile',
      user: req.session.user
    });
});

// POST /users/edit/:userId - Edit user profile
router.post('/edit/:userId', isAuthenticated, async (req, res) => {
    const { userId } = req.params;
    const sessionUserId = req.session.user && req.session.user._id ? req.session.user._id.toString() : null;

    if (sessionUserId !== userId) {
      return res.status(403).json({ success: false, message: 'You can only edit your own profile.' });
    }

    const { firstName, lastName, email } = req.body;
    const allowedUpdates = {};

    if (firstName) allowedUpdates.firstName = String(firstName).trim();
    if (lastName) allowedUpdates.lastName = String(lastName).trim();
    if (email) allowedUpdates.email = String(email).trim().toLowerCase();

    if (Object.keys(allowedUpdates).length === 0) {
      return res.status(400).json({ success: false, message: 'No valid profile changes supplied.' });
    }

    try {
      const existingUser = await User.findById(userId);
      if (!existingUser) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      Object.assign(existingUser, allowedUpdates);
      await existingUser.save();
      await recordAuditEvent({
        actorId: existingUser._id,
        actorRole: existingUser.role || 'user',
        action: 'user:profile:update',
        resourceType: 'User',
        resourceId: existingUser._id
      });

      const safeUser = buildSessionUser(existingUser);
      req.session.user = {
        ...safeUser,
        authenticatedAt: req.session.authenticatedAt || Date.now(),
        lastActivityAt: Date.now(),
        absoluteExpiresAt: req.session.absoluteExpiresAt || Date.now() + SESSION_ABSOLUTE_TIMEOUT_MS
      };

      logger.info('User profile updated.');
      res.json({ 
        success: true, 
        message: 'Profile updated successfully!',
        user: safeUser
      });
    } catch (err) {
      logger.error('Profile update failed.', { code: err.code || 'PROFILE_UPDATE_ERROR' });
      res.status(500).json({ success: false, message: 'Server error during profile update' });
    }
});

// POST /users/change-password/:userId - Change user password
router.post('/change-password/:userId', isAuthenticated, async (req, res) => {
    const { userId } = req.params;
    const sessionUserId = req.session.user && req.session.user._id ? req.session.user._id.toString() : null;

    if (sessionUserId !== userId) {
      return res.status(403).json({ success: false, message: 'You can only change your own password.' });
    }

    const { currentPassword, newPassword, confirmNewPassword } = req.body;

    try {
      const user = await User.findById(userId);

      if (!user) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      const isMatch = await bcrypt.compare(String(currentPassword || ''), user.password);
      if (!isMatch) {
        return res.status(400).json({ success: false, message: 'Current password is incorrect' });
      }

      if (currentPassword === newPassword) {
        return res.status(400).json({ success: false, message: 'New password must be different from current password' });
      }

      if (!isStrongPassword(newPassword) || String(newPassword) !== String(confirmNewPassword)) {
        return res.status(400).json({ success: false, message: 'New password must be at least 8 characters and match confirmation.' });
      }

      user.password = newPassword;
      await user.save();

      await recordAuditEvent({
        actorId: user._id,
        actorRole: user.role || 'user',
        action: 'user:password:change',
        resourceType: 'User',
        resourceId: user._id
      });
      logger.info('User password changed.');
      res.json({ success: true });
    } catch (err) {
      logger.error('Password change failed.', { code: err.code || 'PASSWORD_CHANGE_ERROR' });
      res.status(500).json({ success: false, message: 'Server error during password change' });
    }
});

// POST /users/delete/:userId - Delete user account
router.post('/delete/:userId', isAuthenticated, async (req, res) => {
    const { userId } = req.params;
    const targetUser = await User.findById(userId);

    if (!targetUser) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    if (isProvisionedAdminAccount(targetUser)) {
      return res.status(403).json({ success: false, message: 'The provisioned administrator account cannot be deleted.' });
    }

    const sessionUser = req.session.user;
    const sessionUserId = sessionUser && sessionUser._id ? sessionUser._id.toString() : null;
    const isOwnAccount = sessionUserId === userId;
    const isAdmin = sessionUser && (sessionUser.role === 'Admin' || (Array.isArray(sessionUser.roles) && sessionUser.roles.length > 0));

    if (!isOwnAccount && !isAdmin) {
      return res.status(403).json({ success: false, message: 'You are not authorized to delete this account.' });
    }

    if (!isOwnAccount && targetUser.role === 'Admin') {
      return res.status(403).json({ success: false, message: 'Administrators cannot be deleted by ordinary users.' });
    }

    if (isOwnAccount) {
      const passwordMatches = await bcrypt.compare(String(req.body.currentPassword || ''), targetUser.password);
      if (!passwordMatches) {
        return res.status(400).json({ success: false, message: 'Current password is incorrect.' });
      }
    }

    if (isAdmin && !isOwnAccount && targetUser.role === 'Admin' && sessionUserId !== targetUser._id.toString()) {
      return res.status(403).json({ success: false, message: 'Administrative deletion requires explicit authorization.' });
    }

    try {
      const bookings = await Reservation.find({ userId: targetUser._id })
        .populate({ path: 'flight', select: 'departureDate' })
        .lean();
      const hasFutureBooking = bookings.some(booking =>
        booking.status !== 'Cancelled' && booking.flight.some(flight =>
          isTodayOrFutureInManila(flight.departureDate)
        )
      );
      if (hasFutureBooking) {
        return res.status(409).json({
          success: false,
          message: 'Cancel future bookings before deleting your account.'
        });
      }
      const deleteAccountData = async session => {
        const options = session ? { session } : {};
        for (const booking of bookings) {
          const unset = {
            userId: '',
            privacyNoticeAcceptedBy: '',
            tripType: '',
            travelClass: ''
          };
          const set = { accountDeletedAt: new Date() };
          for (let index = 0; index < booking.passengers.length; index += 1) {
            set[`passengers.${index}.fullName`] = `Passenger ${index + 1}`;
            set[`passengers.${index}.meal`] = 'None';
            set[`passengers.${index}.checkedIn`] = false;
            unset[`passengers.${index}.age`] = '';
            unset[`passengers.${index}.ageCategory`] = '';
            unset[`passengers.${index}.gender`] = '';
            unset[`passengers.${index}.passport`] = '';
            unset[`passengers.${index}.passportEncrypted`] = '';
            unset[`passengers.${index}.passportFingerprint`] = '';
            unset[`passengers.${index}.passportLast3`] = '';
            unset[`passengers.${index}.seatNumber`] = '';
            unset[`passengers.${index}.returnSeatNumber`] = '';
            unset[`passengers.${index}.baggageAllowance`] = '';
            unset[`passengers.${index}.boardingPass`] = '';
            unset[`passengers.${index}.mealConsent`] = '';
          }
          await Reservation.updateOne({ _id: booking._id }, { $set: set, $unset: unset }, options);
        }
        let deletionRequestQuery = PrivacyRequest.findOne({
          requesterId: targetUser._id,
          type: 'deletion',
          status: { $nin: ['COMPLETED', 'REFUSED'] }
        }).sort({ receivedAt: -1 });
        if (session) deletionRequestQuery = deletionRequestQuery.session(session);
        const deletionRequest = await deletionRequestQuery;
        if (deletionRequest) {
          deletionRequest.status = 'COMPLETED';
          deletionRequest.decisionCode = 'ACCOUNT_DELETED';
          deletionRequest.acknowledgedAt = new Date();
          deletionRequest.completedAt = deletionRequest.acknowledgedAt;
          await deletionRequest.save(options);
          await recordAuditEvent({
            actorId: targetUser._id,
            actorRole: targetUser.role || 'user',
            action: 'privacy:request:completed',
            resourceType: 'PrivacyRequest',
            resourceId: deletionRequest._id,
            correlationId: String(deletionRequest._id),
            session
          });
        }
        await recordAuditEvent({
          actorId: targetUser._id,
          actorRole: targetUser.role || 'user',
          action: 'user:account:delete',
          resourceType: 'User',
          resourceId: targetUser._id,
          session
        });
        await User.deleteOne({ _id: userId }, options);
      };
      if (supportsTransactions()) {
        const session = await mongoose.startSession();
        try {
          await session.withTransaction(() => deleteAccountData(session));
        } finally {
          await session.endSession();
        }
      } else {
        await deleteAccountData(null);
      }

      if (isOwnAccount) {
        req.session.destroy(err => {
          if (err) {
            logger.error('Session destruction failed.', { code: err.code || 'SESSION_DESTROY_ERROR' });
          }
          logger.info('User account deleted.');
          res.json({ success: true });
        });
        return;
      }

      logger.info('Admin deleted a user account.');
      res.json({ success: true });
    } catch (err) {
      logger.error('Account deletion failed.', { code: err.code || 'ACCOUNT_DELETE_ERROR' });
      res.status(500).json({ success: false, message: 'Server error during account deletion' });
    }
});

// POST /users/forgot-password - Handle forgot password
router.post('/forgot-password', ...authenticationLimits, async (req, res) => {
  const email = normalizeEmail(req.body.email);

  try {
    const findUser = await User.findOne({ email }).lean();
    if (!findUser) {
      return res.status(200).json({ success: true, message: 'If an account exists, a reset link has been sent.' });
    }

    logger.info('Password recovery requested.');
    res.json({ 
      success: true, 
      message: 'If an account exists, a reset link has been sent.'
    });
  } catch (err) {
    logger.error('Password recovery failed.', { code: err.code || 'PASSWORD_RECOVERY_ERROR' });
    res.status(500).json({ success: false, message: 'Server error during password reset' });
  }
});

// Export the router
module.exports = router;
