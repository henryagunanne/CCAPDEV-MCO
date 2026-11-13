const crypto = require('crypto');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');

const MFA_ISSUER = 'Archers Airline Admin';
const MFA_ALGORITHM = 'aes-256-gcm';

function getEncryptionKey() {
  const configuredKey = process.env.MFA_ENCRYPTION_KEY || '';
  const key = configuredKey && String(configuredKey).trim() ? configuredKey : crypto.randomBytes(32).toString('base64');
  if (!key || !String(key).trim()) {
    throw new Error('MFA_ENCRYPTION_KEY is required for MFA secret encryption.');
  }
  const buffer = Buffer.from(key, 'base64');
  if (buffer.length !== 32) {
    throw new Error('MFA_ENCRYPTION_KEY must decode to a 32-byte value.');
  }
  if (!process.env.MFA_ENCRYPTION_KEY && process.env.NODE_ENV !== 'test') {
    throw new Error('MFA_ENCRYPTION_KEY is required for production MFA secret encryption.');
  }
  return buffer;
}


/** * Encrypts the given MFA secret using AES-256-GCM.
 * @param {string} secret - The MFA secret to encrypt.
 * @returns {string} - The encrypted secret in the format iv:tag:encrypted.
 */
function encryptSecret(secret) {
  if (!secret) return '';
  try {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(MFA_ALGORITHM, key, iv);
    const encrypted = Buffer.concat([cipher.update(String(secret), 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
  } catch (error) {
    throw new Error(`Unable to encrypt MFA secret: ${error.message}`);
  }
}


/** * Decrypts the given encrypted MFA secret using AES-256-GCM.
 * @param {string} secretValue - The encrypted MFA secret in the format iv:tag:encrypted.
 * @returns {string} - The decrypted MFA secret.
 */
function decryptSecret(secretValue) {
  if (!secretValue || typeof secretValue !== 'string') return '';
  try {
    const [ivHex, tagHex, encryptedHex] = secretValue.split(':');
    if (!ivHex || !tagHex || !encryptedHex) {
      return '';
    }
    const key = getEncryptionKey();
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    const encrypted = Buffer.from(encryptedHex, 'hex');
    const decipher = crypto.createDecipheriv(MFA_ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString('utf8');
  } catch (error) {
    return '';
  }
}


/** * Generates a new MFA secret for the user.
 * @returns {string} - The generated MFA secret in base32 format.
 */
function generateSecret() {
  return speakeasy.generateSecret({ length: 32, name: MFA_ISSUER, issuer: MFA_ISSUER }).base32;
}

/** * Builds the OTP Auth URL for the given email and secret.
 * @param {string} email - The user's email address.
 * @param {string} secret - The MFA secret in base32 format.
 * @returns {string} - The OTP Auth URL.
 */
function buildOtpAuthUrl(email, secret) {
  return speakeasy.otpauthURL({
    secret,
    label: email,
    issuer: MFA_ISSUER,
    encoding: 'base32',
    algorithm: 'SHA1',
    digits: 6,
    period: 30
  });
}


/** * Generates a QR code data URL for the given email and secret.
 * @param {string} email - The user's email address.
 * @param {string} secret - The MFA secret in base32 format.
 * @returns {Promise<string>} - A promise that resolves to the QR code data URL.
 */
async function generateQrCodeDataUrl(email, secret) {
  const otpAuthUrl = buildOtpAuthUrl(email, secret);
  return QRCode.toDataURL(otpAuthUrl);
}


/** * Verifies the provided TOTP token against the given secret.
 * @param {string} secret - The MFA secret in base32 format.
 * @param {string} token - The TOTP token provided by the user.
 * @param {Object} options - Optional verification options (e.g., window).
 * @returns {boolean} - Returns true if the token is valid, false otherwise.
 */
function verifyToken(secret, token, options = {}) {
  return verifyTokenCounter(secret, token, options) !== null;
}


/** * Verifies the provided TOTP token against the given secret and returns the counter if valid.
 * @param {string} secret - The MFA secret in base32 format.
 * @param {string} token - The TOTP token provided by the user.
 * @param {Object} options - Optional verification options (e.g., window).
 * @returns {number|null} - Returns the counter if the token is valid, or null if invalid.
 */
function verifyTokenCounter(secret, token, options = {}) {
  if (!secret || !token) return null;
  const normalizedToken = String(token).replace(/\s+/g, '').trim();
  if (!/^\d{6}$/.test(normalizedToken)) return null;

  try {
    const now = Number(options.now || Date.now());
    const step = 30;
    const match = speakeasy.totp.verifyDelta({
      secret,
      encoding: 'base32',
      token: normalizedToken,
      window: Number(options.window || 1),
      digits: 6,
      algorithm: 'SHA1',
      step,
      time: Math.floor(now / 1000)
    });
    return match ? Math.floor(now / 1000 / step) + match.delta : null;
  } catch (error) {
    return null;
  }
}


/** * Generates a specified number of recovery codes for MFA.
 * @param {number} count - The number of recovery codes to generate (default: 10).
 * @returns {string[]} - An array of generated recovery codes.
 */
function generateRecoveryCodes(count = 10) {
  const codes = [];
  for (let index = 0; index < count; index += 1) {
    const random = crypto.randomBytes(10).toString('hex').toUpperCase();
    const code = `${random.slice(0, 4)}-${random.slice(4, 8)}-${random.slice(8, 12)}`;
    codes.push(code);
  }
  return codes;
}


/** * Hashes a recovery code using SHA-256 for secure storage.
 * @param {string} code - The recovery code to hash.
 * @returns {string} - The hashed recovery code in hexadecimal format.
 */
function hashRecoveryCode(code) {
  return crypto.createHash('sha256').update(String(code || '').trim().toLowerCase()).digest('hex');
}


/** * Verifies if the provided recovery code matches any of the stored hashed recovery codes.
 * @param {string[]} recoveryCodes - An array of hashed recovery codes.
 * @param {string} inputCode - The recovery code provided by the user.
 * @returns {number|null} - Returns the index of the matching recovery code, or null if not found.
 */
function verifyRecoveryCode(recoveryCodes, inputCode) {
  if (!Array.isArray(recoveryCodes) || !inputCode) return null;
  const normalized = String(inputCode).trim();
  const hash = hashRecoveryCode(normalized);
  const index = recoveryCodes.findIndex((code) => code === hash);
  if (index === -1) return null;
  return index;
}


/** * Checks if the user has completed MFA enrollment.
 * @param {Object} user - The user object to check.
 * @returns {boolean} - Returns true if MFA enrollment is complete, false otherwise.
 */
function isMfaEnrollmentComplete(user) {
  const isAdministrator = user && (user.role === 'Admin' || Array.isArray(user.roles) && user.roles.length > 0);
  if (!isAdministrator) return false;
  return Boolean(user.mfaEnabled && user.mfaSecret && String(user.mfaSecret).trim().length > 0);
}

module.exports = {
  MFA_ISSUER,
  generateSecret,
  buildOtpAuthUrl,
  generateQrCodeDataUrl,
  verifyToken,
  verifyTokenCounter,
  encryptSecret,
  decryptSecret,
  generateRecoveryCodes,
  hashRecoveryCode,
  verifyRecoveryCode,
  isMfaEnrollmentComplete
};
