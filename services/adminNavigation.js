const { permissions, hasPermission } = require('../config/rbac');
const { isProvisionedAdminAccount } = require('./adminIdentity');

function getAdminNavigation(user) {
  return {
    canReadFlights: hasPermission(user, permissions.FLIGHT_READ),
    canCreateFlights: hasPermission(user, permissions.FLIGHT_CREATE),
    canReadReservations: hasPermission(user, permissions.RESERVATION_READ),
    canManageApprovals: hasPermission(user, permissions.ADMIN_ROLE_ASSIGN),
    canManageEmergencyAccess: hasPermission(user, permissions.SECURITY_REVIEW),
    canManagePrivacy: hasPermission(user, permissions.PRIVACY_REQUEST_MANAGE),
    canReviewSecurity: hasPermission(user, permissions.SECURITY_REVIEW),
    canManageAdmins: isProvisionedAdminAccount(user) || hasPermission(user, permissions.ADMIN_ROLE_ASSIGN),
    canViewAdminProfile: true
  };
}

module.exports = { getAdminNavigation };
