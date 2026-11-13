const crypto = require('crypto');
const express = require('express');
const mongoose = require('mongoose');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const logger = require('../logs/logger');
const { permissions, rolePermissions, hasPermission, getEffectivePermissions } = require('../config/rbac');
const { requirePermission, denyAccess } = require('../middleware/adminAuth');
const { isProvisionedAdminAccount } = require('../services/adminIdentity');
const { recordAuditEvent } = require('../services/auditService');

const router = express.Router();
const PAGE_SIZE = 25;
const ADMIN_ROLE_NAMES = Object.keys(rolePermissions).filter((roleName) => roleName !== 'user');
const ADMIN_AUDIT_ACTIONS = [
  'admin:account:create',
  'admin:account:setup',
  'admin:role:update',
  'admin:status:update',
  'admin:profile:update'
];


/**
 * Generate a human-readable label for a role name.
 * @param {string} roleName - The role name.
 * @returns {string} - The formatted role label.
 */
function roleLabel(roleName) {
  return String(roleName || '')
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}


/** * Generate a human-readable label for a permission name.
 * @param {string} permission - The permission name.
 * @returns {string} - The formatted permission label.
 */
function permissionLabel(permission) {
  return String(permission || '')
    .split(/[:_-]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}


/** * Get the list of roles that the actor can assign to other administrators.
 * @param {Object} actor - The authenticated user performing the action.
 * @returns {Array} - An array of role options with their labels and permissions.
 */
function roleOptionsFor(actor) {
  const actorPermissions = new Set(getEffectivePermissions(actor));
  const isProvisionedAdmin = isProvisionedAdminAccount(actor);

  return ADMIN_ROLE_NAMES
    .filter((roleName) => isProvisionedAdmin ||
      rolePermissions[roleName].every((permission) => actorPermissions.has(permission)))
    .map((roleName) => ({
      name: roleName,
      label: roleLabel(roleName),
      permissions: rolePermissions[roleName].map((name) => ({
        name,
        label: permissionLabel(name)
      }))
    }));
}


/** * Middleware to require that the authenticated user has administrator management permissions.
 * @param {Object} req - The Express request object.
 * @param {Object} res - The Express response object.
 * @param {Function} next - The next middleware function.
 */
function requireAdminManagement(req, res, next) {
  if (isProvisionedAdminAccount(req.authenticatedUser) ||
      hasPermission(req.authenticatedUser, permissions.ADMIN_ROLE_ASSIGN)) {
    return next();
  }
  return denyAccess(res, 'You do not have permission to manage administrator accounts.');
}


/** * Middleware to require that the authenticated user has permission to change administrator account status.
 * @param {Object} req - The Express request object.
 * @param {Object} res - The Express response object.
 * @param {Function} next - The next middleware function.
 */
function requireAdminStatusPermission(req, res, next) {
  return requirePermission(permissions.ADMIN_ACCESS_REVOKE)(req, res, next);
}


/** * Render the administrator creation page with optional messages.
 * @param {Object} res - The Express response object.
 * @param {Object} actor - The authenticated user performing the action.
 * @param {Object} options - Optional rendering options.
 */
function renderCreatePage(res, actor, options = {}) {
  return res.status(options.statusCode || 200).render('admin/management-create', {
    layout: 'admin',
    title: 'Create Administrator',
    roles: roleOptionsFor(actor),
    canAssignRoles: roleOptionsFor(actor).length > 0,
    errorMessage: options.errorMessage || '',
    successMessage: options.successMessage || '',
    inviteUrl: options.inviteUrl || ''
  });
}

/** * Normalize a text value by trimming whitespace and limiting its length.
 * @param {string} value - The text value to normalize.
 * @param {number} maxLength - The maximum length of the normalized string.
 * @returns {string} - The normalized string.
 */
function normalizeText(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}


/** * Escape special characters in a string for use in a regular expression.
 * @param {string} value - The string to escape.
 * @returns {string} - The escaped string.
 */
function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}


/** * Safely query for an administrator account by ID, excluding the provisioned administrator.
 * @param {string} id - The ID of the administrator to query.
 * @returns {Promise<Object|null>} - A promise resolving to the administrator document or null.
 */
function safeAdministratorQuery(id) {
  if (!mongoose.isValidObjectId(id)) return null;
  return User.findOne({
    _id: id,
    role: 'Admin',
    isProvisionedAdmin: { $ne: true }
  }).select('firstName lastName email role roles permissions status createdAt lastLoginAt sessionVersion isProvisionedAdmin');
}


/** * Check if the target administrator is the last one with administrator management permissions.
 * @param {Object} target - The administrator to check.
 * @returns {Promise<boolean>} - A promise resolving to true if the target is the last management administrator, false otherwise.
 */
async function isLastManagementAdministrator(target) {
  if (!hasPermission(target, permissions.ADMIN_ROLE_ASSIGN)) return false;
  const count = await countActiveManagementAdministrators();
  return count <= 1;
}


/** * Count the number of active administrators with administrator management permissions.
 * @returns {Promise<number>} - A promise resolving to the count of active management administrators.
 * */
async function countActiveManagementAdministrators() {
  return User.countDocuments({
    role: 'Admin',
    status: { $nin: ['disabled', 'suspended'] },
    $or: [
      { isProvisionedAdmin: true },
      { roles: 'user_access_admin' },
      { permissions: permissions.ADMIN_ROLE_ASSIGN }
    ]
  });
}


/** * Build a URL for the administrator management page with query parameters and pagination.
 * @param {Object} query - The query parameters.
 * @param {number} page - The current page number.
 * @returns {string} - The constructed URL.
 */
function buildManagementUrl(query, page) {
  const params = new URLSearchParams();
  for (const key of ['search', 'role', 'status', 'sort', 'direction']) {
    if (query[key]) params.set(key, query[key]);
  }
  params.set('page', String(page));
  return `/admin/management?${params.toString()}`;
}

router.use(requireAdminManagement);

router.get('/', async (req, res) => {
  const search = normalizeText(req.query.search, 100);
  const role = ADMIN_ROLE_NAMES.includes(req.query.role) ? req.query.role : '';
  const status = ['active', 'disabled', 'suspended'].includes(req.query.status) ? req.query.status : '';
  const sort = ['name', 'email', 'role', 'status', 'createdAt', 'lastLoginAt'].includes(req.query.sort)
    ? req.query.sort
    : 'createdAt';
  const direction = req.query.direction === 'asc' ? 1 : -1;
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const filter = {
    role: 'Admin',
    isProvisionedAdmin: { $ne: true }
  };
  if (role) filter.roles = role;
  if (status) filter.status = status;
  if (search) {
    const expression = new RegExp(escapeRegex(search), 'i');
    filter.$or = [{ firstName: expression }, { lastName: expression }, { email: expression }];
  }

  const sortOption = sort === 'name'
    ? { firstName: direction, lastName: direction }
    : { [sort === 'role' ? 'roles' : sort]: direction, _id: 1 };

  try {
    const [total, accounts] = await Promise.all([
      User.countDocuments(filter),
      User.find(filter)
        .select('firstName lastName email roles status createdAt lastLoginAt')
        .sort(sortOption)
        .skip((page - 1) * PAGE_SIZE)
        .limit(PAGE_SIZE)
        .lean()
    ]);
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const roleLabels = Object.fromEntries(ADMIN_ROLE_NAMES.map((roleName) => [roleName, roleLabel(roleName)]));
    const pageQuery = {
      search,
      role,
      status,
      sort,
      direction: direction === 1 ? 'asc' : 'desc'
    };

    return res.render('admin/management', {
      layout: 'admin',
      title: 'Admin Management',
      administrators: accounts.map((account) => ({
        ...account,
        fullName: `${account.firstName} ${account.lastName}`,
        roleNames: (account.roles || []).map((roleName) => roleLabels[roleName] || roleName),
        statusLabel: account.status === 'active' ? 'Active' : 'Inactive',
        statusClass: account.status === 'active' ? 'text-bg-success' : 'text-bg-secondary'
      })),
      roleOptions: roleOptionsFor(req.authenticatedUser),
      allRoles: ADMIN_ROLE_NAMES.map((roleName) => ({
        name: roleName,
        label: roleLabel(roleName),
        selected: role === roleName
      })),
      filters: { search, role, status, sort, direction: direction === 1 ? 'asc' : 'desc' },
      currentPage: page,
      totalPages: pages,
      totalAdministrators: total,
      canAssignRoles: roleOptionsFor(req.authenticatedUser).length > 0,
      previousUrl: page > 1 ? buildManagementUrl(pageQuery, page - 1) : '',
      nextUrl: page < pages ? buildManagementUrl(pageQuery, page + 1) : ''
    });
  } catch (error) {
    logger.error('Administrator list request failed.', { code: error.code || 'ADMIN_MANAGEMENT_LIST_ERROR' });
    return res.status(500).render('error/server-error', { layout: 'admin', title: 'Administrator Management Error' });
  }
});

router.get('/new', (req, res) => renderCreatePage(res, req.authenticatedUser));

router.post('/', async (req, res) => {
  const firstName = normalizeText(req.body.firstName, 80);
  const lastName = normalizeText(req.body.lastName, 80);
  const email = normalizeText(req.body.email, 254).toLowerCase();
  const assignedRole = normalizeText(req.body.assignedRole, 80);
  const status = req.body.status || 'active';
  const assignableRoles = roleOptionsFor(req.authenticatedUser);

  if (!/^[\p{L}][\p{L}\p{M}' -]{0,79}$/u.test(firstName) ||
      !/^[\p{L}][\p{L}\p{M}' -]{0,79}$/u.test(lastName) ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      !assignableRoles.some((option) => option.name === assignedRole) ||
      !['active', 'disabled'].includes(status) ||
      req.body.confirmed !== 'true') {
    return renderCreatePage(res, req.authenticatedUser, {
      statusCode: 400,
      errorMessage: 'Confirm the account details and choose a valid role within your authority.'
    });
  }

  const setupToken = crypto.randomBytes(32).toString('base64url');
  const setupTokenHash = crypto.createHash('sha256').update(setupToken).digest('hex');
  const temporaryPassword = crypto.randomBytes(48).toString('base64url');
  let createdAdministratorId = null;

  try {
    const administrator = new User({
      firstName,
      lastName,
      email,
      password: temporaryPassword,
      role: 'Admin',
      roles: [assignedRole],
      permissions: [],
      status,
      isProvisionedAdmin: false,
      mustSetPassword: true,
      passwordSetupTokenHash: setupTokenHash,
      passwordSetupExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      mfaEnabled: false,
      mfaVerified: false,
      mfaPendingSecret: '',
      mfaSecret: ''
    });
    await administrator.save();
    createdAdministratorId = administrator._id;
    await recordAuditEvent({
      actorId: req.authenticatedUser._id,
      actorRole: req.authenticatedUser.role,
      action: 'admin:account:create',
      resourceType: 'Administrator',
      resourceId: administrator._id,
      details: { assignedRole, status }
    });

    return renderCreatePage(res, req.authenticatedUser, {
      statusCode: 201,
      successMessage: 'Administrator account created. Share the one-time setup link with the new administrator using a secure channel.',
      inviteUrl: `/users/admin-setup#token=${setupToken}`
    });
  } catch (error) {
    if (error.code === 11000) {
      return renderCreatePage(res, req.authenticatedUser, {
        statusCode: 409,
        errorMessage: 'An account already uses that email address.'
      });
    }
    if (createdAdministratorId) {
      try {
        await User.deleteOne({
          _id: createdAdministratorId,
          mustSetPassword: true,
          passwordSetupTokenHash: setupTokenHash
        });
      } catch (cleanupError) {
        logger.error('Incomplete administrator account cleanup failed.', {
          code: cleanupError.code || 'ADMIN_ACCOUNT_CLEANUP_ERROR'
        });
      }
    }
    logger.error('Administrator account creation failed.', { code: error.code || 'ADMIN_ACCOUNT_CREATE_ERROR' });
    return res.status(500).render('error/server-error', { layout: 'admin', title: 'Administrator Creation Error' });
  }
});

router.get('/:id/edit', async (req, res) => {
  try {
    const administrator = await safeAdministratorQuery(req.params.id);
    if (!administrator || isProvisionedAdminAccount(administrator)) {
      return res.status(404).render('error/404', { layout: 'admin', title: 'Administrator Not Found' });
    }

    const currentPermissions = getEffectivePermissions(administrator);
    const roles = roleOptionsFor(req.authenticatedUser).map((option) => ({
      ...option,
      selected: option.name === (administrator.roles || [])[0],
      addedPermissions: option.permissions.filter((permission) => !currentPermissions.includes(permission.name)),
      removedPermissions: currentPermissions
        .filter((permission) => !rolePermissions[option.name].includes(permission))
        .map((name) => ({ name, label: permissionLabel(name) }))
    }));

    return res.render('admin/management-edit', {
      layout: 'admin',
      title: 'Edit Administrator Role',
      administrator: {
        ...administrator.toObject(),
        fullName: `${administrator.firstName} ${administrator.lastName}`,
        currentRole: (administrator.roles || []).map(roleLabel).join(', ') || 'No role assigned'
      },
      currentPermissions: currentPermissions.map((name) => ({ name, label: permissionLabel(name) })),
      roles
    });
  } catch (error) {
    logger.error('Administrator role page request failed.', { code: error.code || 'ADMIN_ROLE_PAGE_ERROR' });
    return res.status(500).render('error/server-error', { layout: 'admin', title: 'Role Management Error' });
  }
});

router.post('/:id/role', async (req, res) => {
  const assignedRole = normalizeText(req.body.assignedRole, 80);
  const allowedRoles = roleOptionsFor(req.authenticatedUser);

  if (!allowedRoles.some((option) => option.name === assignedRole)) {
    return denyAccess(res, 'You cannot assign a role with permissions beyond your authority.');
  }
  if (req.body.confirmed !== 'true') {
    return res.status(400).render('error/access-denied', {
      layout: 'admin',
      title: 'Confirmation Required',
      message: 'Confirm the role change before submitting it.'
    });
  }

  try {
    const administrator = await safeAdministratorQuery(req.params.id);
    if (!administrator || isProvisionedAdminAccount(administrator)) {
      return res.status(404).render('error/404', { layout: 'admin', title: 'Administrator Not Found' });
    }
    if (String(administrator._id) === String(req.authenticatedUser._id)) {
      return denyAccess(res, 'You cannot change your own administrator role.');
    }
    if ((administrator.roles || []).length === 1 && administrator.roles[0] === assignedRole) {
      return res.status(400).render('error/access-denied', {
        layout: 'admin',
        title: 'No Role Change',
        message: 'The administrator already has this role.'
      });
    }

    const isLastManagementAdmin = await isLastManagementAdministrator(administrator);
    if (isLastManagementAdmin &&
        !rolePermissions[assignedRole].includes(permissions.ADMIN_ROLE_ASSIGN)) {
      return res.status(409).render('error/access-denied', {
        layout: 'admin',
        title: 'Role Change Not Allowed',
        message: 'At least one active administrator must retain administrator-management authority.'
      });
    }

    const updated = await User.findOneAndUpdate(
      { _id: administrator._id, role: 'Admin', isProvisionedAdmin: { $ne: true } },
      { $set: { roles: [assignedRole], permissions: [] }, $inc: { sessionVersion: 1 } },
      { new: true, runValidators: true }
    ).select('roles');
    if (!updated) return res.status(409).redirect('/admin/management');

    await recordAuditEvent({
      actorId: req.authenticatedUser._id,
      actorRole: req.authenticatedUser.role,
      action: 'admin:role:update',
      resourceType: 'Administrator',
      resourceId: administrator._id,
      details: {
        previousRoles: administrator.roles || [],
        assignedRole
      }
    });
    return res.redirect(`/admin/management/${administrator._id}?updated=role`);
  } catch (error) {
    logger.error('Administrator role update failed.', { code: error.code || 'ADMIN_ROLE_UPDATE_ERROR' });
    return res.status(500).render('error/server-error', { layout: 'admin', title: 'Role Update Error' });
  }
});

router.post('/:id/status', requireAdminStatusPermission, async (req, res) => {
  const status = req.body.status;
  if (!['active', 'disabled'].includes(status) || req.body.confirmed !== 'true') {
    return res.status(400).render('error/access-denied', {
      layout: 'admin',
      title: 'Confirmation Required',
      message: 'Confirm a valid administrator account status before submitting it.'
    });
  }

  try {
    const administrator = await safeAdministratorQuery(req.params.id);
    if (!administrator || isProvisionedAdminAccount(administrator)) {
      return res.status(404).render('error/404', { layout: 'admin', title: 'Administrator Not Found' });
    }
    if (String(administrator._id) === String(req.authenticatedUser._id)) {
      return denyAccess(res, 'You cannot change your own administrator account status.');
    }
    if (administrator.status === status) {
      return res.redirect(`/admin/management/${administrator._id}`);
    }
    if (status !== 'active' && await isLastManagementAdministrator(administrator)) {
      return res.status(409).render('error/access-denied', {
        layout: 'admin',
        title: 'Status Change Not Allowed',
        message: 'At least one active administrator must retain administrator-management authority.'
      });
    }

    const updated = await User.findOneAndUpdate(
      { _id: administrator._id, role: 'Admin', isProvisionedAdmin: { $ne: true } },
      { $set: { status }, $inc: { sessionVersion: 1 } },
      { new: true, runValidators: true }
    ).select('status');
    if (!updated) return res.status(409).redirect('/admin/management');

    await recordAuditEvent({
      actorId: req.authenticatedUser._id,
      actorRole: req.authenticatedUser.role,
      action: 'admin:status:update',
      resourceType: 'Administrator',
      resourceId: administrator._id,
      details: { previousStatus: administrator.status, status }
    });
    return res.redirect(`/admin/management/${administrator._id}?updated=status`);
  } catch (error) {
    logger.error('Administrator status update failed.', { code: error.code || 'ADMIN_STATUS_UPDATE_ERROR' });
    return res.status(500).render('error/server-error', { layout: 'admin', title: 'Status Update Error' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const administrator = await safeAdministratorQuery(req.params.id);
    if (!administrator || isProvisionedAdminAccount(administrator)) {
      return res.status(404).render('error/404', { layout: 'admin', title: 'Administrator Not Found' });
    }
    const [history, roleLabels] = await Promise.all([
      AuditLog.find({
        resourceType: 'Administrator',
        resourceId: String(administrator._id),
        action: { $in: ADMIN_AUDIT_ACTIONS }
      })
        .populate('actorId', 'firstName lastName email')
        .sort({ timestamp: -1 })
        .limit(50)
        .select('actorId action details timestamp result')
        .lean(),
      Promise.resolve(Object.fromEntries(ADMIN_ROLE_NAMES.map((roleName) => [roleName, roleLabel(roleName)])))
    ]);
    const permissionsForRole = getEffectivePermissions(administrator);

    return res.render('admin/management-details', {
      layout: 'admin',
      title: 'Administrator Details',
      administrator: {
        ...administrator.toObject(),
        fullName: `${administrator.firstName} ${administrator.lastName}`,
        roleNames: (administrator.roles || []).map((roleName) => roleLabels[roleName] || roleName),
        statusLabel: administrator.status === 'active' ? 'Active' : 'Inactive',
        isActive: administrator.status === 'active',
        canViewHistory: true
      },
      permissions: permissionsForRole.map((name) => ({ name, label: permissionLabel(name) })),
      canChangeStatus: hasPermission(req.authenticatedUser, permissions.ADMIN_ACCESS_REVOKE) &&
        String(administrator._id) !== String(req.authenticatedUser._id),
      canAssignRoles: roleOptionsFor(req.authenticatedUser).length > 0,
      history: history.map((event) => ({
        ...event,
        actorName: event.actorId
          ? `${event.actorId.firstName} ${event.actorId.lastName}`
          : 'System',
        actionLabel: event.action.split(':').slice(1).join(' ').replace(/(^|\s)\S/g, (letter) => letter.toUpperCase()),
        detailsText: event.details ? JSON.stringify(event.details) : ''
      })),
      updateType: ['role', 'status'].includes(req.query.updated) ? req.query.updated : ''
    });
  } catch (error) {
    logger.error('Administrator details request failed.', { code: error.code || 'ADMIN_DETAILS_ERROR' });
    return res.status(500).render('error/server-error', { layout: 'admin', title: 'Administrator Details Error' });
  }
});

module.exports = router;
