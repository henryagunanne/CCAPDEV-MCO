const { adminEmail } = require('../config/env');


/**
 * Check if a user is the provisioned administrator account.
 * @param {Object} user - The user object to check.
 * @returns {boolean} - Returns true if the user is the provisioned administrator, false otherwise.
 */
function isProvisionedAdminAccount(user) {
  if (!user || user.role !== 'Admin') return false;
  if (user.isProvisionedAdmin === true) return true;
  return Boolean(adminEmail) &&
    String(user.email || '').trim().toLowerCase() === adminEmail.trim().toLowerCase();
}

module.exports = { isProvisionedAdminAccount };
