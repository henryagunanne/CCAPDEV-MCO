const speakeasy = require('speakeasy');
const QRCode = require('qrcode');

/** * Generates a new secret for MFA.
 * @returns {string} The generated secret in base32 format.
 */
function generateSecret() {
  return speakeasy.generateSecret({ length: 32, name: 'Archers Airline Admin' }).base32;
}

/** * Builds the OTP Auth URL for MFA setup.
 * @param {string} email - The user's email address.
 * @param {string} secret - The MFA secret in base32 format.
 * @returns {string} The OTP Auth URL.
 */
function buildOtpAuthUrl(email, secret) {
  return speakeasy.otpauthURL({
    secret,
    label: email,
    issuer: 'Archers Airline Admin',
    encoding: 'base32'
  });
}

/** * Generates a QR code data URL for MFA setup.
 * @param {string} email - The user's email address.
 * @param {string} secret - The MFA secret in base32 format.
 * @returns {Promise<string>} A promise that resolves to the QR code data URL.
 */
async function generateQrCodeDataUrl(email, secret) {
  const otpAuthUrl = buildOtpAuthUrl(email, secret);
  return QRCode.toDataURL(otpAuthUrl);
}


/** * Verifies the provided MFA token against the secret.
 * @param {string} secret - The MFA secret in base32 format.
 * @param {string} token - The MFA token provided by the user.
 * @returns {boolean} True if the token is valid, false otherwise.
 */                                               
function verifyToken(secret, token) {
  if (!secret || !token) return false;

  try {
    return speakeasy.totp.verify({
      secret,
      encoding: 'base32',
      token: String(token).trim(),
      window: 1
    });
  } catch (error) {
    return false;
  }
}


module.exports = {
  generateSecret,
  buildOtpAuthUrl,
  generateQrCodeDataUrl,
  verifyToken
};
