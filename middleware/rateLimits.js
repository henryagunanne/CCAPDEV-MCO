const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const crypto = require('crypto');
const { isTestEnvironment } = require('../config/env');


/** * Create a rate limiter middleware with the specified maximum requests and key generator.
 * @param {number} max - The maximum number of requests allowed in the time window.
 * @param {Function} [keyGenerator] - Optional function to generate a unique key for each request.
 * @returns {Function} - The rate limiter middleware function.
 */
function createLimit(max, keyGenerator) {
  return rateLimit({
    windowMs: 60 * 1000,
    limit: isTestEnvironment ? 1000 : max,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator,
    handler: (req, res) => {
      const retryAfter = Math.max(1, Math.ceil((req.rateLimit.resetTime - Date.now()) / 1000));
      res.set('Retry-After', String(retryAfter));
      res.status(429).json({ success: false, message: 'Too many requests. Try again later.' });
    }
  });
}


// Rate limiters for different scenarios
const byIp = createLimit;
const byAccount = (max) => createLimit(max, (req) => {
  const accountId = req.session?.user?._id;
  return accountId ? `account:${accountId}` : `ip:${ipKeyGenerator(req.ip)}`;
});
const byEmail = (max) => createLimit(max, (req) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  return email ? `email:${crypto.createHash('sha256').update(email).digest('hex')}` : `ip:${ipKeyGenerator(req.ip)}`;
});
const byMfaAccount = (max) => createLimit(max, (req) => {
  const accountId = req.session?.user?._id
    || req.session?.mfaPending?.userId
    || req.session?.mfaReenrollment?.userId;
  return accountId ? `mfa:${accountId}` : `ip:${ipKeyGenerator(req.ip)}`;
});

module.exports = {
  flightSearchLimits: [byIp(60), byAccount(60)],
  bookingLimits: [byIp(10), byAccount(10)],
  cancellationLimits: [byIp(10), byAccount(10)],
  checkInLimits: [byIp(10)],
  authenticationLimits: [byIp(10), byEmail(10)],
  mfaVerificationLimits: [byIp(10), byMfaAccount(10)],
  recoveryCodeLimits: [byIp(5), byMfaAccount(5)]
};
