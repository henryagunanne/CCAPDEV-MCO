const crypto = require('crypto');

const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;
const TOKEN_BYTES = 32;


/** * Create or retrieve a CSRF token for the session.
 * If the token is older than TOKEN_TTL_MS, generate a new one.
 * @param {Object} session - The session object from the request.
 * @returns {string} - The CSRF token.
 */
function createToken(session) {
  const now = Date.now();
  if (!session.csrfToken || now - Number(session.csrfTokenIssuedAt || 0) >= TOKEN_TTL_MS) {
    session.csrfToken = crypto.randomBytes(TOKEN_BYTES).toString('base64url');
    session.csrfTokenIssuedAt = now;
  }
  return session.csrfToken;
}


/** * Compare two strings in a timing-safe manner to prevent timing attacks.
 * @param {string} left - The first string to compare.
 * @param {string} right - The second string to compare.
 * @returns {boolean} - True if the strings are equal, false otherwise.
 */
function safeEqual(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}


/** * Middleware to protect against CSRF attacks.
 * Validates the CSRF token for unsafe HTTP methods (POST, PUT, DELETE).
 * For safe methods (GET, HEAD, OPTIONS), it generates a new token.
 * @param {Object} req - The Express request object.
 * @param {Object} res - The Express response object.
 * @param {Function} next - The next middleware function.
 */
function csrfProtection(req, res, next) {
  const method = req.method.toUpperCase();
  const safeMethod = ['GET', 'HEAD', 'OPTIONS'].includes(method);
  if (safeMethod) {
    res.locals.csrfToken = createToken(req.session);
    return next();
  }

  const expected = req.session?.csrfToken;
  const supplied = req.get('x-csrf-token') || req.body?._csrf;
  const issuedAt = Number(req.session?.csrfTokenIssuedAt || 0);
  if (!expected || Date.now() - issuedAt >= TOKEN_TTL_MS || !safeEqual(expected, supplied)) {
    if (req.accepts('html') && !req.xhr && !req.is('application/json')) {
      return res.status(403).send('Invalid or expired request token.');
    }
    return res.status(403).json({ success: false, message: 'Invalid or expired request token.' });
  }
  return next();
}

module.exports = { csrfProtection, createToken };
