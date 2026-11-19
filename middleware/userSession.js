const User = require('../models/User');
const logger = require('../logs/logger');

/* ======================================================
   Signed-in account middleware (MCO4 remediation)
   Re-checks the account behind every signed-in request on customer-facing routes:
   - no session            -> 401 (REQ-AA-01: unauthenticated requests get 401 or a login redirect)
   - account deleted, disabled or suspended, or sessionVersion changed (password change,
     administrator role/status change) -> the session is destroyed and the request gets 401
   This is the same freshness check requireAdminAccess applies to admin routes (C-04, C-06).
====================================================== */

// Short-lived per-process cache of account state, so the freshness check costs at most one
// indexed read per account every few seconds instead of one per request (load test, NFR-02).
// Password changes, self-deletion and administrator status changes call invalidateAccount()
// so revocation is immediate in this process; other instances pick it up within ACCOUNT_CACHE_TTL_MS.
const ACCOUNT_CACHE_TTL_MS = 5000;
const ACCOUNT_CACHE_MAX = 10000;
const accountCache = new Map();

function invalidateAccount(userId) {
  accountCache.delete(String(userId));
}

async function loadAccountState(userId) {
  const key = String(userId);
  const now = Date.now();
  const cached = accountCache.get(key);
  if (cached && now - cached.loadedAt < ACCOUNT_CACHE_TTL_MS) return cached.account;
  const account = await User.findById(userId).select('status sessionVersion').lean();
  if (accountCache.size >= ACCOUNT_CACHE_MAX) accountCache.delete(accountCache.keys().next().value);
  accountCache.set(key, { account, loadedAt: now });
  return account;
}

function wantsHtml(req) {
  return !req.xhr && String(req.get('accept') || '').includes('text/html');
}

function respond(req, res, statusCode, message) {
  if (wantsHtml(req)) {
    return res.status(statusCode).render('error/access-denied', {
      title: statusCode === 401 ? 'Authentication Required' : 'Access Denied',
      message
    });
  }
  return res.status(statusCode).json({ success: false, message });
}

function rejectStaleSession(req, res, message) {
  req.session.destroy((error) => {
    if (error) logger.error('Stale session cleanup failed.', { code: error.code || 'SESSION_CLEANUP_ERROR' });
    respond(req, res, 401, message);
  });
}

async function requireActiveUser(req, res, next) {
  const sessionUser = req.session && req.session.user;
  if (!sessionUser || !sessionUser._id) {
    return respond(req, res, 401, 'Please sign in to continue.');
  }
  try {
    const account = await loadAccountState(sessionUser._id);
    if (!account ||
        account.status === 'disabled' ||
        account.status === 'suspended' ||
        Number(account.sessionVersion || 0) !== Number(sessionUser.sessionVersion || 0)) {
      invalidateAccount(sessionUser._id);
      return rejectStaleSession(req, res, 'Your session is no longer valid. Please sign in again.');
    }
    return next();
  } catch (error) {
    return next(error);
  }
}

module.exports = { requireActiveUser, invalidateAccount };
