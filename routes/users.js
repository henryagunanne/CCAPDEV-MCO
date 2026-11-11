// routes/users.js
const express = require('express');
const User = require('../models/User');
const bcrypt = require('bcrypt');
const router = express.Router();
const logger = require('../logs/logger');
const AuditLog = require('../models/AuditLog');
const { getEffectivePermissions, isAdminAccount } = require('../config/rbac');
const { generateSecret, generateQrCodeDataUrl, verifyToken, buildOtpAuthUrl } = require('../services/mfa');

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
    mfaEnabled: Boolean(user.mfaEnabled),
    mfaVerified: Boolean(user.mfaVerified),
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
  try {
    await AuditLog.create({
      actorId,
      actorRole,
      action,
      resourceType,
      resourceId,
      result,
      approvalId,
      reason,
      correlationId
    });
  } catch (error) {
    logger.error('Audit log creation failed:', error);
  }
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

// POST /users/register - Handle user registration
router.post('/register', async (req, res) => {
    const { firstName, lastName, email, password, dateOfBirth } = req.body;

    const normalizedEmail = normalizeEmail(email);

    if (!firstName || !lastName || !normalizedEmail || !dateOfBirth || !isStrongPassword(password)) {
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
        password,
        dateOfBirth
      });

      await newUser.save();
      res.status(200).json({ success: true });
      logger.info(`New registered User - ${newUser._id}`);
    } catch (err) {
      logger.error('Registration error:', err);
      const message = err && err.message ? err.message : 'Server error during registration';
      res.status(400).json({ success: false, message });
    }
});

// POST /users/login - Handle user login
router.post('/login', async (req, res) => {
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
      // Check if the account is locked due to too many failed login attempts
      const lockUntil = user.lockUntil ? new Date(user.lockUntil).getTime() : 0;
      if (lockUntil > Date.now()) {
        return res.status(403).json({ success: false, message: INVALID_LOGIN_MESSAGE });
      }

      // Compare the provided password with the stored hashed password
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        await handleFailedLogin(user);
        await recordAuditLog({ actorId: user._id, actorRole: user.role || 'user', action: 'admin:login', resourceType: 'User', result: 'FAILURE', reason: 'Invalid password' });
        return res.status(401).json({ success: false, message: INVALID_LOGIN_MESSAGE });
      }

      await clearFailedLoginState(user);

      user.lastLoginAt = new Date();
      if (user.role === 'Admin' && user.mfaEnabled && !user.mfaVerified) {
        user.mfaVerified = false;
      }

      req.session.regenerate((err) => {
        if (err) {
          logger.error('Session regeneration error:', err);
          return res.status(500).json({ success: false, message: 'Login failed.' });
        }

        const authenticatedAt = Date.now();
        const safeSessionUser = buildSessionUser(user);
        req.session.user = {
          ...safeSessionUser,
          authenticatedAt,
          lastActivityAt: authenticatedAt,
          absoluteExpiresAt: authenticatedAt + SESSION_ABSOLUTE_TIMEOUT_MS
        };
        req.session.stepUp = null;
        req.session.authenticatedAt = authenticatedAt;
        req.session.lastActivityAt = authenticatedAt;
        req.session.absoluteExpiresAt = authenticatedAt + SESSION_ABSOLUTE_TIMEOUT_MS;
        req.session.cookie.maxAge = SESSION_IDLE_TIMEOUT_MS;

        logger.info(`${user.firstName} - ${user._id} logged in`);
        recordAuditLog({ actorId: user._id, actorRole: user.role || 'user', action: 'admin:login', resourceType: 'User', result: 'SUCCESS', reason: 'Successful login' }).catch(() => {});

        return res.status(200).json({ 
          success: true, 
          isAdmin: req.session.user.role === 'Admin',
          mfaRequired: Boolean(user.role === 'Admin' && user.mfaEnabled && !user.mfaVerified),
          message: `Welcome, ${user.firstName}!` 
        });
      });

    } catch (err) {
      logger.error('Login error:', err);
      res.status(500).json({ success: false, message: 'Server error during login' });
    }
});

// GET /users/mfa/setup - Initialize admin MFA enrollment
router.get('/mfa/setup', isAuthenticated, async (req, res) => {
  try {
    const user = await User.findById(req.session.user._id);
    if (!user || user.role !== 'Admin') {
      return res.status(403).json({ success: false, message: 'Administrative access required.' });
    }

    if (!user.mfaSecret) {
      user.mfaSecret = generateSecret();
      user.mfaEnabled = true;
      user.mfaVerified = false;
      await user.save();
    }

    const qrCode = await generateQrCodeDataUrl(user.email, user.mfaSecret);
    
    return res.status(200).json({
      success: true,
      secret: user.mfaSecret,
      otpAuthUrl: buildOtpAuthUrl(user.email, user.mfaSecret),
      qrCode
    });
  } catch (error) {
    logger.error('MFA enrollment error:', error);
    return res.status(500).json({ success: false, message: 'Unable to configure MFA.' });
  }
});

// POST /users/mfa/verify - Verify MFA token to complete admin login
router.post('/mfa/verify', isAuthenticated, async (req, res) => {
  const { token } = req.body;

  try {
    const user = await User.findById(req.session.user._id);
    if (!user || user.role !== 'Admin') {
      return res.status(403).json({ success: false, message: 'Administrative access required.' });
    }

    if (!user.mfaSecret) {
      return res.status(400).json({ success: false, message: 'MFA is not configured.' });
    }

    const isValid = verifyToken(user.mfaSecret, String(token || '').trim());
    if (!isValid) {
      return res.status(400).json({ success: false, message: 'Invalid MFA code.' });
    }

    user.mfaVerified = true;
    user.lastMfaVerifiedAt = new Date();
    await user.save();

    req.session.user.mfaVerified = true;
    req.session.user.mfaEnabled = true;
    req.session.stepUp = {
      verifiedAt: new Date().toISOString(),
      method: 'mfa'
    };
    logger.info(`Admin MFA verification succeeded for ${user.email}`);
    await recordAuditLog({ actorId: user._id, actorRole: user.role || 'Admin', action: 'admin:mfa:verify', resourceType: 'User', result: 'SUCCESS', reason: 'MFA verification succeeded' });

    return res.status(200).json({ success: true, message: 'MFA verification succeeded.' });
  } catch (error) {
    logger.error('MFA verification error:', error);
    return res.status(500).json({ success: false, message: 'Unable to verify MFA code.' });
  }
});

// POST /users/logout - Handle user logout
router.post('/logout', isAuthenticated, (req, res) => {
    req.session.stepUp = null;
    req.session.destroy(err => {
      if (err) {
        logger.error('Logout error:', err);
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

    const { firstName, lastName, email, dateOfBirth } = req.body;
    const allowedUpdates = {};

    if (firstName) allowedUpdates.firstName = String(firstName).trim();
    if (lastName) allowedUpdates.lastName = String(lastName).trim();
    if (email) allowedUpdates.email = String(email).trim().toLowerCase();
    if (dateOfBirth) allowedUpdates.dateOfBirth = new Date(dateOfBirth);

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

      const safeUser = buildSessionUser(existingUser);
      req.session.user = {
        ...safeUser,
        authenticatedAt: req.session.authenticatedAt || Date.now(),
        lastActivityAt: Date.now(),
        absoluteExpiresAt: req.session.absoluteExpiresAt || Date.now() + SESSION_ABSOLUTE_TIMEOUT_MS
      };

      logger.info(`User ${userId} updated profile`);
      res.json({ 
        success: true, 
        message: 'Profile updated successfully!',
        user: safeUser
      });
    } catch (err) {
      logger.error('Profile update error:', err);
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

      logger.info(`User ${user._id} has changed their password`);
      res.json({ success: true });
    } catch (err) {
      logger.error('Password change error:', err);
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

    if (isAdmin && !isOwnAccount && targetUser.role === 'Admin' && sessionUserId !== targetUser._id.toString()) {
      return res.status(403).json({ success: false, message: 'Administrative deletion requires explicit authorization.' });
    }

    try {
      await User.findByIdAndDelete(userId);

      if (isOwnAccount) {
        req.session.destroy(err => {
          if (err) {
            logger.error('Session destruction error:', err);
          }
          logger.info(`User deleted ${targetUser.firstName} ${targetUser.lastName}`);
          res.json({ success: true });
        });
        return;
      }

      logger.info(`Admin user deleted account ${targetUser._id}`);
      res.json({ success: true });
    } catch (err) {
      logger.error('Account deletion error:', err);
      res.status(500).json({ success: false, message: 'Server error during account deletion' });
    }
});

// POST /users/forgot-password - Handle forgot password
router.post('/forgot-password', async (req, res) => {
  const email = normalizeEmail(req.body.email);

  try {
    const findUser = await User.findOne({ email }).lean();
    if (!findUser) {
      return res.status(200).json({ success: true, message: 'If an account exists, a reset link has been sent.' });
    }

    logger.info(`User ${findUser.lastName} - ${findUser._id} has requested to change their password`);
    res.json({ 
      success: true, 
      message: 'If an account exists, a reset link has been sent.'
    });
  } catch (err) {
    logger.error('Forgot password error:', err);
    res.status(500).json({ success: false, message: 'Server error during password reset' });
  }
});

// Export the router
module.exports = router;
