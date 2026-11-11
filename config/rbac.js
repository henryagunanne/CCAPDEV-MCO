const permissions = {
  FLIGHT_READ: 'flight:read',
  FLIGHT_CREATE: 'flight:create',
  FLIGHT_UPDATE: 'flight:update',
  FLIGHT_DELETE: 'flight:delete',
  RESERVATION_READ: 'reservation:read',
  RESERVATION_UPDATE: 'reservation:update',
  RESERVATION_CANCEL: 'reservation:cancel',
  FINANCE_READ: 'finance:read',
  REFUND_CREATE: 'refund:create',
  REFUND_APPROVE: 'refund:approve',
  USER_CREATE: 'user:create',
  USER_UPDATE: 'user:update',
  USER_DISABLE: 'user:disable',
  USER_REACTIVATE: 'user:reactivate',
  ADMIN_ROLE_ASSIGN: 'admin:role:assign',
  ADMIN_ACCESS_REVOKE: 'admin:access:revoke',
  AUDIT_READ: 'audit:read',
  SECURITY_REVIEW: 'security:review',
  PRIVACY_REQUEST_MANAGE: 'privacy:request:manage',
  PASSPORT_REVEAL: 'passport:reveal',
  PASSENGER_EDIT: 'passenger:edit',
  OPERATIONAL_FLIGHT_UPDATE: 'operational:flight:update',
  AIRCRAFT_ASSIGN: 'aircraft:assign'
};

const rolePermissions = {
  flight_operations_admin: [
    permissions.FLIGHT_READ,
    permissions.FLIGHT_CREATE,
    permissions.FLIGHT_UPDATE,
    permissions.AIRCRAFT_ASSIGN,
    permissions.OPERATIONAL_FLIGHT_UPDATE
  ],
  reservation_support_admin: [
    permissions.RESERVATION_READ,
    permissions.RESERVATION_UPDATE,
    permissions.RESERVATION_CANCEL,
    permissions.PASSENGER_EDIT
  ],
  finance_admin: [
    permissions.FINANCE_READ,
    permissions.REFUND_CREATE,
    permissions.REFUND_APPROVE
  ],
  user_access_admin: [
    permissions.USER_CREATE,
    permissions.USER_UPDATE,
    permissions.USER_DISABLE,
    permissions.USER_REACTIVATE,
    permissions.ADMIN_ROLE_ASSIGN,
    permissions.ADMIN_ACCESS_REVOKE
  ],
  security_audit_admin: [
    permissions.AUDIT_READ,
    permissions.SECURITY_REVIEW
  ],
  data_protection_officer: [
    permissions.PRIVACY_REQUEST_MANAGE
  ],
  user: []
};

/**
 * Normalizes a list of permissions by ensuring they are unique and trimmed.
 * @param {Array} value - The list of permissions to normalize.
 * @returns {Array} - A normalized list of unique permissions.
 */
function normalisePermissionList(value) {

  // Ensure the input is an array and filter out any non-string or empty entries
  const list = Array.isArray(value) ? value : [];
  const unique = new Set();

  // Iterate through the list and add trimmed, non-empty strings to the set
  for (const item of list) {
    if (typeof item === 'string' && item.trim()) {
      unique.add(item.trim());
    }
  }
  return Array.from(unique);
}

/**
 * Retrieves the permissions associated with the roles of a user.
 * @param {Object} user - The user object containing roles and permissions.
 * @returns {Array} - A list of permissions derived from the user's roles.
 */
function getRolePermissions(user) {

  // Ensure the user object is valid and has roles
  const roles = Array.isArray(user?.roles) ? user.roles : [];
  const permissionsSet = new Set();

  // Iterate through each role and add its associated permissions to the set
  for (const roleName of roles) {
    const roleEntries = rolePermissions[roleName] || [];
    for (const permission of roleEntries) {
      permissionsSet.add(permission);
    }
  }

  // If the user is an Admin, include their direct permissions as well
  if (user?.role === 'Admin') {
    const defaultPermissions = normalisePermissionList(user?.permissions || []);
    for (const permission of defaultPermissions) permissionsSet.add(permission);
  }

  return Array.from(permissionsSet);
}


/**
 * Retrieves the effective permissions for a user, combining role-based and direct permissions.
 * @param {Object} user - The user object containing roles and permissions.
 * @returns {Array} - A list of effective permissions for the user.
 */
function getEffectivePermissions(user) {
  const merged = [...getRolePermissions(user)];
  return normalisePermissionList(merged);
}


/**
 * Checks if a user has a specific permission.
 * @param {Object} user - The user object containing roles and permissions.
 * @param {string} requiredPermission - The permission to check for.
 * @returns {boolean} - True if the user has the required permission, false otherwise.
 */
function hasPermission(user, requiredPermission) {
  if (!requiredPermission) return true;
  const effective = getEffectivePermissions(user);
  return effective.includes(requiredPermission);
}


/**
 * Determines if a user account is an admin account based on role or assigned roles.
 * @param {Object} user - The user object containing role and roles.
 * @returns {boolean} - True if the user is an admin, false otherwise.
 */
function isAdminAccount(user) {
  if (!user) return false;
  return user.role === 'Admin' || Array.isArray(user.roles) && user.roles.length > 0;
}


module.exports = {
  permissions,
  rolePermissions,
  getEffectivePermissions,
  hasPermission,
  isAdminAccount,
  normalisePermissionList
};
