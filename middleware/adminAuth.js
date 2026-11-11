const { hasPermission, isAdminAccount } = require('../config/rbac');

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


/** * Middleware to require authentication for admin routes.
 * Checks if the user is logged in, has admin role, and is not disabled or suspended.
 * If MFA is enabled, checks if it has been verified.
 */
function requireAuthentication(req, res, next) {
  const user = req.session?.user;

  if (!user) {
    return denyAccess(res, 'Authentication required.', 401);
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

  if (user.mfaEnabled && !user.mfaVerified) {
    return res.status(403).json({
      success: false,
      code: 'MFA_REQUIRED',
      message: 'Multi-factor authentication is required.'
    });
  }

  req.authenticatedUser = user;
  return next();
}


/** * Middleware to require admin access for routes.
 * Checks if the user is logged in, has admin role, and is not disabled or suspended.
 * If MFA is enabled, checks if it has been verified.
 */
function requireAdminAccess(req, res, next) {
  const user = req.session?.user;

  if (!user) {
    return denyAccess(res, 'Authentication required.', 401);
  }

  if (!isAdminAccount(user)) {
    return denyAccess(res, 'Administrative access is required.', 403);
  }

  if (user.status === 'disabled' || user.status === 'suspended') {
    return denyAccess(res, 'This administrator account is disabled.', 403);
  }

  if (user.mfaEnabled && !user.mfaVerified) {
    return res.status(403).json({
      success: false,
      code: 'MFA_REQUIRED',
      message: 'Multi-factor authentication is required.'
    });
  }

  req.authenticatedUser = user;
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
