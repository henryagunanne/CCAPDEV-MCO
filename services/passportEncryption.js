const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const NONCE_BYTES = 12;
const TAG_BYTES = 16;

/** * Get the master encryption key from the environment variable.
 * If not set, and in a test environment, use a default key for testing.
 * @returns {Buffer} - The master key as a Buffer.
 * @throws {Error} - If the key is not 32 bytes long.
 */
function getMasterKey() {
  const configured = process.env.PASSPORT_ENCRYPTION_KEY;
  const encoded = process.env.NODE_ENV === 'test' && !configured
    ? Buffer.alloc(32, 7).toString('base64')
    : configured;
  const key = Buffer.from(encoded || '', 'base64');
  if (key.length !== 32) {
    throw new Error('PASSPORT_ENCRYPTION_KEY must be a base64-encoded 32-byte key.');
  }
  return key;
}


/** * Derive a purpose-specific key from the master key using HMAC-SHA256.
 * @param {string} purpose - The purpose string to derive the key for.
 * @returns {Buffer} - The derived key as a Buffer.
 */
function deriveKey(purpose) {
  return crypto.createHmac('sha256', getMasterKey()).update(purpose).digest();
}


/** * Encrypt a passport value using AES-256-GCM.
 * @param {string} value - The passport value to encrypt.
 * @returns {Object} - An object containing the encrypted data and metadata.
 * @throws {TypeError} - If the input value is not a valid passport string.
 */
function encryptPassport(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9]{6,9}$/.test(value)) {
    throw new TypeError('Passport value is invalid.');
  }
  const iv = crypto.randomBytes(NONCE_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, deriveKey('passport-encryption-v1'), iv, {
    authTagLength: TAG_BYTES
  });
  const ciphertext = Buffer.concat([cipher.update(value.toUpperCase(), 'utf8'), cipher.final()]);
  return {
    algorithm: ALGORITHM,
    version: 1,
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64')
  };
}


/** * Decrypt an encrypted passport object back to its original value.
 * @param {Object} encrypted - The encrypted passport object.
 * @returns {string} - The decrypted passport value.
 * @throws {TypeError} - If the input is malformed or has an unsupported format.
 */
function decryptPassport(encrypted) {
  if (!encrypted || encrypted.algorithm !== ALGORITHM || encrypted.version !== 1) {
    throw new TypeError('Encrypted passport value has an unsupported format.');
  }
  const iv = Buffer.from(encrypted.iv || '', 'base64');
  const authTag = Buffer.from(encrypted.authTag || '', 'base64');
  const ciphertext = Buffer.from(encrypted.ciphertext || '', 'base64');
  if (iv.length !== NONCE_BYTES || authTag.length !== TAG_BYTES || !ciphertext.length) {
    throw new TypeError('Encrypted passport value is malformed.');
  }
  const decipher = crypto.createDecipheriv(ALGORITHM, deriveKey('passport-encryption-v1'), iv, {
    authTagLength: TAG_BYTES
  });
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

/** * Create a fingerprint of a passport value using HMAC-SHA256.
 * @param {string} value - The passport value to fingerprint.
 * @returns {string} - The fingerprint as a hexadecimal string.
 * @throws {TypeError} - If the input value is not a valid passport string.
 */
function fingerprintPassport(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9]{6,9}$/.test(value)) {
    throw new TypeError('Passport value is invalid.');
  }
  return crypto.createHmac('sha256', deriveKey('passport-fingerprint-v1'))
    .update(value.trim().toUpperCase())
    .digest('hex');
}


/** * Mask a passport value, showing only the last 3 characters.
 * @param {string} value - The passport value to mask.
 * @returns {string} - The masked passport value.
 */
function maskPassport(value) {
  if (typeof value !== 'string' || !value) return '';
  return `***${value.slice(-3)}`;
}


/** * Retrieve the stored passport value from a passenger object, decrypting if necessary.
 * @param {Object} passenger - The passenger object containing passport data.
 * @returns {string|null} - The decrypted passport value or null if not available.
 */
function getStoredPassport(passenger) {
  if (passenger?.passportEncrypted?.ciphertext) {
    return decryptPassport(passenger.passportEncrypted);
  }
  if (typeof passenger?.passport === 'string') return passenger.passport;
  return null;
}

module.exports = {
  encryptPassport,
  decryptPassport,
  fingerprintPassport,
  maskPassport,
  getStoredPassport
};
