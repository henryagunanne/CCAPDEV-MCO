// routes/users.js
const express = require('express');
const User = require('../models/User');
const bcrypt = require('bcryptjs'); // for password hashing and comparison
const router = express.Router();
const logger = require('../logs/logger');
const AuditLog = require('../models/AuditLog');
const { getEffectivePermissions, isAdminAccount } = require('../config/rbac');
const { generateSecret, generateQrCodeDataUrl, verifyToken, buildOtpAuthUrl } = require('../services/mfa');


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
  
    try {
      // Hash the password
      //const hashedPassword = await bcrypt.hash(password, 10);
  
      const newUser = new User({
        firstName,
        lastName,
        email,
        password,
        dateOfBirth
      });

      // Check if email already exists
      const existingUser = await User.findOne({email: email}).lean();
      if (existingUser) {
        return res
        .status(400)
        .json({ success: false, message: 'Email already registered' });
      }
  
      await newUser.save();
      res.status(200).json({ success: true });
      logger.info(`New registered User - ${newUser._id}`);
    } catch (err) {
      logger.error('Registration error:', err);
      res.status(500).send('Server error during registration');
    }
});

// POST /users/login - Handle user login
router.post('/login', async (req, res) => {
    const { email, password } = req.body;
  
    try {
      const user = await User.findOne({ email: email });
      
      // Check if user exists
      if (!user) {
        // Record audit log for failed login attempt
        await recordAuditLog({ actorRole: 'anonymous', action: 'admin:login', resourceType: 'User', result: 'FAILURE', reason: 'User not found' });
        return res.status(400).json({ message: 'User not found' });
      }

      // Check if user is disabled or suspended
      if (user.status === 'disabled' || user.status === 'suspended') {
        await recordAuditLog({ actorId: user._id, actorRole: user.role || 'user', action: 'admin:login', resourceType: 'User', result: 'FAILURE', reason: 'Account disabled' });
        return res.status(403).json({ message: 'This user account is disabled.' });
      }
  
      // Compare the provided password with the stored hashed password
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        await recordAuditLog({ actorId: user._id, actorRole: user.role || 'user', action: 'admin:login', resourceType: 'User', result: 'FAILURE', reason: 'Invalid password' });
        return res.status(400).json({ message:'Invalid password' });
      }

      // Update last login timestamp and handle MFA verification status
      user.lastLoginAt = new Date();
      if (user.role === 'Admin' && user.mfaEnabled && !user.mfaVerified) {
        user.mfaVerified = false;
      }
      
      req.session.regenerate((err) => {
        if (err) {
          logger.error('Session regeneration error:', err);
          return res.status(500).json({ message: 'Login failed.' });
        }

        const safeSessionUser = buildSessionUser(user);
        req.session.user = safeSessionUser;
        req.session.user.role = user.role;
        req.session.stepUp = null;

        logger.info(`${user.firstName} - ${user._id} logged in`);
        recordAuditLog({ actorId: user._id, actorRole: user.role || 'user', action: 'admin:login', resourceType: 'User', result: 'SUCCESS', reason: 'Successful login' }).catch(() => {});

        return res.status(200).json({ 
          success: true, 
          isAdmin: req.session.user.role === 'Admin',
          mfaRequired: Boolean(user.mfaEnabled && !user.mfaVerified),
          message: `Welcome, ${user.firstName}!` 
        });
      });

    } catch (err) {
      logger.error('Login error:', err);
      res.status(500).send('Server error during login');
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
        return res.status(500).send('Server error during logout');
      }
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
    const { firstName, lastName, email, dateOfBirth } = req.body;

    try {
      const updatedUser = await User.findByIdAndUpdate(
        userId,
        { firstName, lastName, email, dateOfBirth },
        { new: true }
      ).lean();
  
      if (!updatedUser) {
        return res.status(404).send('User not found');
      }
      
      // Update session user data
      req.session.user = updatedUser;
      logger.info(`User ${req.body} has updated their profile`);
      res.json({ 
        success: true, 
        message: 'Profile updated successfully!',
        user: updatedUser 
      });
    } catch (err) {
      logger.error('Profile update error:', err);
      res.status(500).send('Server error during profile update');
    }
});

// POST /users/change-password/:userId - Change user password
router.post('/change-password/:userId', isAuthenticated, async (req, res) => {
    const { userId } = req.params;
    const { currentPassword, newPassword, confirmNewPassword } = req.body;
  
    try {
      const user = await User.findById(userId);
  
      if (!user) {
        return res.status(404).send('User not found');
      }
  
      const isMatch = await bcrypt.compare(currentPassword, user.password);
      if (!isMatch) {
        return res.status(400).send('Current password is incorrect');
      }

      // ensure that current password and new passwords are not the same
      if (currentPassword === newPassword) {
        return res.status(400).send('New password must be different from current password');
      }

      // ensure that new password and confirm password match
      if (newPassword !== confirmNewPassword) {
        return res.status(400).send('New password and confirmation do not match');
      }
  
      // Hash the new password
      const hashedNewPassword = await bcrypt.hash(newPassword, 10);
      user.password = hashedNewPassword;
      await user.save();
      
      logger.info(`User ${user._id} has changed their password`)
      res.json({ success: true });
    } catch (err) {
      logger.error('Password change error:', err);
      res.status(500).send('Server error during password change');
    }
});

// POST /users/delete/:userId - Delete user account
router.post('/delete/:userId', isAuthenticated, isAdmin, async (req, res) => {
    const { userId } = req.params;
  
    try {
      const deletedUser = await User.findByIdAndDelete(userId);
  
      if (!deletedUser) {
        return res.status(404).send('User not found');
      }
  
      // Destroy session after account deletion
      req.session.destroy(err => {
        if (err) {
          logger.error('Session destruction error:', err);
        }
        logger.info(`User deleted ${deletedUser.firstName} ${deletedUser.lastName}`);
        res.json({ success: true });
      });
    } catch (err) {
      logger.error('Account deletion error:', err);
      res.status(500).send('Server error during account deletion');
    }
});

// POST /users/forgot-password - Handle forgot password
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body; 

  try {
    const findUser = await User.findOne({ email: email }).lean();
    if (!findUser) {
      return res.status(400).send('User not found');
    }

    logger.info(`User ${findUser.lastName} - ${findUser._id} has requested to change their password`)
    // Here you would typically generate a password reset token and send an email
    res.json({ 
      success: true, 
      message: 'Password reset link sent to email (simulated)' 
    });
  } catch (err) {
    logger.error('Forgot password error:', err);
    res.status(500).send('Server error during password reset');
  }
});

// Export the router
module.exports = router;
