const { hasPermission, isAdminAccount, getEffectivePermissions } = require('../config/rbac');
const User = require('../models/User');
const { isProvisionedAdminAccount } = require('../services/adminIdentity');
const logger = require('../logs/logger');

/* ======================================================
   Admin Authentication Middleware
====================================================== */

/**
 * Deny access and render an error page.
 * @param {Object} res - Express response object.
 * @param {string} message - Error message to display.
 * @param {number} statusCode - HTTP status code (default: 403).
 */
function denyAccess(res, message = 'Access denied.', statusCode = 403) {
  return res.status(statusCode).render('error/access-denied', {
    title: 'Access Denied',
    message
  });
}

function denyMfaRequired(req, res, message) {
  const pending = req.session?.mfaPending;
  const isHtmlPageRequest = ['GET', 'HEAD'].includes(req.method)
    && (req.get('accept') || '').includes('text/html')
    && !req.xhr;

  if (isHtmlPageRequest && pending && ['enroll', 'verify'].includes(pending.stage)) {
    return res.redirect(`/users/mfa/${pending.stage}`);
  }

  if (isHtmlPageRequest) {
    return res.status(403).render('error/access-denied', {
      title: 'MFA Required',
      message: `${message} Sign in again to complete MFA verification.`,
      actionUrl: '/',
      actionLabel: 'Return to sign in'
    });
  }

  return res.status(403).json({
    success: false,
    code: 'MFA_REQUIRED',
    message
  });
}


/** * Check if the current session is pending MFA verification.
 * @param {Object} req - Express request object.
 * @returns {boolean} - Returns true if MFA is pending, false otherwise.
 */
function isMfaPendingSession(req) {
  const pending = req.session && req.session.mfaPending;
  if (!pending) return false;
  if (pending.expiresAt && Date.now() > Number(pending.expiresAt)) {
    req.session.mfaPending = null;
    return false;
  }
  return true;
}


/** * Middleware to require authentication for admin routes.
 * Checks if the user is logged in, has admin role, and is not disabled or suspended.
 * If MFA is enabled, checks if it has been verified.
 */
function requireAuthentication(req, res, next) {
  const user = req.session?.user;

  if (!user) {
    return denyAccess(res, 'Authentication required.', 401);
  }

  if (isMfaPendingSession(req)) {
    return denyMfaRequired(req, res, 'Multi-factor authentication is required.');
  }

  if (user.status === 'disabled' || user.status === 'suspended') {
    return denyAccess(res, 'This administrator account is disabled.', 403);
  }

  if (user.role !== 'Admin' && (!Array.isArray(user.roles) || user.roles.length === 0)) {
    return denyAccess(res, 'Administrative access is required.', 403);
  }

  req.authenticatedUser = user;
  return next();
}


/** * Middleware to require MFA verification for admin routes.
 * Checks if the user is logged in, has admin role, and is not disabled or suspended.
 * If MFA is enabled, checks if it has been verified.
 */
function requireMfaVerification(req, res, next) {
  const user = req.session?.user;

  if (!user) {
    return denyAccess(res, 'Authentication required.', 401);
  }

  if (isMfaPendingSession(req)) {
    return denyMfaRequired(req, res, 'Multi-factor authentication is required.');
  }

  if (user.mfaEnabled && !user.mfaVerified) {
    return denyMfaRequired(req, res, 'Multi-factor authentication is required.');
  }

  req.authenticatedUser = user;
  return next();
}


/** * Middleware to require admin access for routes.
 * Checks if the user is logged in, has admin role, and is not disabled or suspended.
 * If MFA is enabled, checks if it has been verified.
 */
async function requireAdminAccess(req, res, next) {
  const sessionUser = req.session?.user;

  if (!sessionUser) {
    return denyAccess(res, 'Authentication required.', 401);
  }

  if (isMfaPendingSession(req)) {
    return denyMfaRequired(
      req,
      res,
      'Multi-factor authentication is required before accessing administrative functions.'
    );
  }

  const account = await User.findById(sessionUser._id);
  if (!account || !isAdminAccount(account)) {
    req.session.destroy((error) => {
      if (error) logger.error('Invalid administrator session cleanup failed.', { code: error.code || 'ADMIN_SESSION_CLEANUP_ERROR' });
    });
    return denyAccess(res, 'Administrative access is required.', 403);
  }

  const isProvisionedAdmin = isProvisionedAdminAccount(account);
  if (isProvisionedAdmin && !account.isProvisionedAdmin) {
    account.isProvisionedAdmin = true;
    await account.save();
  }

  if (account.status === 'disabled' || account.status === 'suspended') {
    req.session.destroy((error) => {
      if (error) logger.error('Disabled administrator session cleanup failed.', { code: error.code || 'ADMIN_SESSION_CLEANUP_ERROR' });
    });
    return denyAccess(res, 'This administrator account is disabled.', 403);
  }

  if (Number(sessionUser.sessionVersion || 0) !== Number(account.sessionVersion || 0)) {
    req.session.destroy((error) => {
      if (error) logger.error('Revoked administrator session cleanup failed.', { code: error.code || 'ADMIN_SESSION_CLEANUP_ERROR' });
    });
    return denyAccess(res, 'Your administrative access changed. Sign in again to continue.', 403);
  }

  if (account.mfaEnabled && !account.mfaVerified) {
    return denyMfaRequired(req, res, 'Multi-factor authentication is required.');
  }

  const freshUser = {
    ...sessionUser,
    _id: account._id,
    firstName: account.firstName,
    lastName: account.lastName,
    email: account.email,
    role: account.role,
    roles: account.roles || [],
    permissions: getEffectivePermissions(account),
    status: account.status || 'active',
    isProvisionedAdmin,
    isAdmin: isAdminAccount(account),
    mfaEnabled: Boolean(account.mfaEnabled),
    mfaVerified: Boolean(account.mfaVerified),
    sessionVersion: Number(account.sessionVersion || 0)
  };
  req.session.user = freshUser;
  req.authenticatedUser = freshUser;
  return next();
}


/** * Middleware to require a specific permission for admin routes.
 * Checks if the user is logged in, has admin role, and is not disabled or suspended.
 * If MFA is enabled, checks if it has been verified.
 * Then checks if the user has the required permission.
 */
function requirePermission(permission) {
  return (req, res, next) => {
    const user = req.session?.user;

    if (!user) {
      return denyAccess(res, 'Authentication required.', 401);
    }

    if (!hasPermission(user, permission)) {
      return denyAccess(res, 'You do not have the required permission for this action.', 403);
    }

    return next();
  };
}


/** * Middleware to require access to a specific resource for admin routes.
 * Checks if the user is logged in, has admin role, and is not disabled or suspended.
 * If MFA is enabled, checks if it has been verified.
 * Then checks if the user has access to the specified resource type and ID.
 */
function requireResourceAccess(resourceType, resourceField = 'id') {
  return async (req, res, next) => {
    const user = req.session?.user;

    if (!user) {
      return denyAccess(res, 'Authentication required.', 401);
    }

    if (user.role === 'Admin' || (Array.isArray(user.roles) && user.roles.length > 0)) {
      return next();
    }

    const resourceId = req.params && req.params[resourceField];
    if (!resourceId) {
      return denyAccess(res, 'Invalid resource reference.', 400);
    }

    const allowedResources = user.resourceAccess || {};
    const bucket = allowedResources[resourceType] || [];

    if (!bucket.includes(resourceId)) {
      return denyAccess(res, `You do not have access to this ${resourceType}.`, 403);
    }

    return next();
  };
}

/** * Middleware to require step-up authentication for sensitive admin actions.
 * Checks if the user is logged in, has admin role, and is not disabled or suspended.
 * If MFA is enabled, checks if it has been verified.
 * Then checks if the user has performed step-up authentication within the specified TTL.
 * Finally, checks if the user has the required permissions for step-up authentication.
 */
function requireStepUpAuthentication(requiredPermissions, ttlMs = 5 * 60 * 1000) {
  return (req, res, next) => {
    const user = req.session?.user;

    if (!user) {
      return denyAccess(res, 'Authentication required.', 401);
    }

    const stepUp = req.session?.stepUp;
    const stepUpVerifiedAt = stepUp && stepUp.verifiedAt ? new Date(stepUp.verifiedAt).getTime() : null;

    if (!stepUpVerifiedAt) {
      return res.status(403).json({
        success: false,
        code: 'STEP_UP_REQUIRED',
        message: 'Step-up authentication is required for this action.'
      });
    }

    if (Date.now() - stepUpVerifiedAt > ttlMs) {
      req.session.stepUp = null;
      return res.status(403).json({
        success: false,
        code: 'STEP_UP_EXPIRED',
        message: 'Step-up authentication has expired. Please re-authenticate.'
      });
    }

    const permissionsToCheck = Array.isArray(requiredPermissions)
      ? requiredPermissions
      : requiredPermissions ? [requiredPermissions] : [];

    const hasRequiredPermissions = permissionsToCheck.every((permission) => hasPermission(user, permission));

    if (!hasRequiredPermissions) {
      return denyAccess(res, 'You do not have the required step-up permissions.', 403);
    }

    return next();
  };
}

module.exports = {
  denyAccess,
  requireAuthentication,
  requireMfaVerification,
  requireAdminAccess,
  requirePermission,
  requireResourceAccess,
  requireStepUpAuthentication
};
