require('dotenv').config();

const isTest = process.env.NODE_ENV === 'test' || !!process.env.JEST_WORKER_ID;
const requiredEnv = ['MONGODB_URI', 'SESSION_SECRET', 'PASSPORT_ENCRYPTION_KEY'];

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

module.exports = {
  isTestEnvironment: isTest,
  port: Number.parseInt(process.env.PORT || '3000', 10),
  mongoUri: isTest ? (process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/airlineDB') : process.env.MONGODB_URI,
  sessionSecret: isTest ? (process.env.SESSION_SECRET || 'test-session-secret') : process.env.SESSION_SECRET,
  passportEncryptionKey: process.env.PASSPORT_ENCRYPTION_KEY || '',
  adminEmail: process.env.ADMIN_EMAIL || '',
  dpoContact: process.env.DPO_CONTACT || 'Not configured; set DPO_CONTACT before operational use.'
};
