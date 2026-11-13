require('dotenv').config();
const path = require('path');

const isTest = process.env.NODE_ENV === 'test' || !!process.env.JEST_WORKER_ID;
const requiredEnv = ['MONGODB_URI', 'SESSION_SECRET', 'PASSPORT_ENCRYPTION_KEY', 'MFA_ENCRYPTION_KEY'];
const projectRoot = path.resolve(__dirname, '..');

/**
 * Resolves a project-relative path and ensures it stays within the project directory.
 * @param {string} value - The configured path value from environment variables.
 * @param {string} fallback - The default fallback path if the value is not provided.
 * @param {string} variableName - The name of the environment variable for error messages.
 * @returns {string} - The resolved absolute path.
 * @throws {Error} - If the resolved path is outside the project directory or if it's absolute.
 */
function resolveProjectPath(value, fallback, variableName) {
  const configuredPath = value || fallback;
  if (path.isAbsolute(configuredPath)) {
    throw new Error(`${variableName} must be relative to the project directory.`);
  }
  const resolvedPath = path.resolve(projectRoot, configuredPath);
  if (!resolvedPath.startsWith(`${projectRoot}${path.sep}`)) {
    throw new Error(`${variableName} must stay within the project directory.`);
  }
  return resolvedPath;
}


// Validate TLS_MODE. 
const tlsMode = process.env.TLS_MODE || 'local';
if (!['local', 'proxy'].includes(tlsMode)) {
  throw new Error('TLS_MODE must be either "local" or "proxy".');
}

if (!isTest) {
  // Check for missing required environment variables
  const missing = requiredEnv.filter((name) => !process.env[name] || !String(process.env[name]).trim());

  // Throw an error if any required environment variables are missing
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

if (process.env.PASSPORT_ENCRYPTION_KEY) {
  const key = Buffer.from(process.env.PASSPORT_ENCRYPTION_KEY, 'base64');
  if (key.length !== 32 || key.toString('base64') !== process.env.PASSPORT_ENCRYPTION_KEY) {
    throw new Error('PASSPORT_ENCRYPTION_KEY must be canonical base64 for exactly 32 bytes.');
  }
}

if (process.env.MFA_ENCRYPTION_KEY) {
  const key = Buffer.from(process.env.MFA_ENCRYPTION_KEY, 'base64');
  if (key.length !== 32 || key.toString('base64') !== process.env.MFA_ENCRYPTION_KEY) {
    throw new Error('MFA_ENCRYPTION_KEY must be canonical base64 for exactly 32 bytes.');
  }
}

module.exports = {
  isTestEnvironment: isTest,
  port: Number.parseInt(process.env.PORT || '3000', 10),
  mongoUri: isTest ? (process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/airlineDB') : process.env.MONGODB_URI,
  sessionSecret: isTest ? (process.env.SESSION_SECRET || 'test-session-secret') : process.env.SESSION_SECRET,
  passportEncryptionKey: process.env.PASSPORT_ENCRYPTION_KEY || '',
  adminEmail: process.env.ADMIN_EMAIL || '',
  mfaEncryptionKey: process.env.MFA_ENCRYPTION_KEY || '',
  dpoContact: process.env.DPO_CONTACT || 'Not configured; set DPO_CONTACT before operational use.',
  tlsMode,
  tlsKeyPath: resolveProjectPath(
    process.env.TLS_KEY_PATH,
    'certs/localhost-key.pem',
    'TLS_KEY_PATH'
  ),
  tlsCertPath: resolveProjectPath(
    process.env.TLS_CERT_PATH,
    'certs/localhost.pem',
    'TLS_CERT_PATH'
  )
};
