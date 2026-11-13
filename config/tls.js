const fs = require('fs');
const tls = require('tls');


/**
 * Determines whether to use local HTTPS based on the environment and TLS mode.
 * @param {Object} options - The options object.
 * @param {boolean} options.isTestEnvironment - Whether the current environment is a test environment.
 * @param {boolean} options.isProduction - Whether the current environment is production.
 * @param {string} options.tlsMode - The TLS mode, either 'local' or 'proxy'.
 * @returns {boolean} - True if local HTTPS should be used, false otherwise.
 */
function shouldUseLocalHttps({ isTestEnvironment, isProduction, tlsMode }) {
  return !isTestEnvironment && isProduction && tlsMode === 'local';
}


/**
 * Loads TLS options from the specified certificate and key paths.
 * @param {Object} options - The options object.
 * @param {string} options.certPath - The path to the TLS certificate file.
 * @param {string} options.keyPath - The path to the TLS private key file.
 * @returns {Object} - An object containing the loaded certificate and key.
 * @throws {Error} - If the certificate or key files cannot be read or are invalid.
 */
function loadTlsOptions({ certPath, keyPath }) {
  let cert;
  let key;
  try {
    cert = fs.readFileSync(certPath);
    key = fs.readFileSync(keyPath);
  } catch (error) {
    const code = error.code || 'TLS_FILE_ERROR';
    throw new Error(
      `HTTPS production simulation requires readable TLS files at "${certPath}" and "${keyPath}" (${code}). Generate them with mkcert or configure TLS_MODE=proxy.`
    );
  }

  try {
    tls.createSecureContext({ cert, key });
  } catch {
    throw new Error(
      'HTTPS production simulation could not load the TLS certificate and private key. Check that the files are valid and match.'
    );
  }

  return { cert, key };
}

module.exports = { shouldUseLocalHttps, loadTlsOptions };
