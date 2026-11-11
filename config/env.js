require('dotenv').config();

const isTest = process.env.NODE_ENV === 'test' || !!process.env.JEST_WORKER_ID;
const requiredEnv = ['MONGODB_URI', 'SESSION_SECRET'];

if (!isTest) {
  // Check for missing required environment variables
  const missing = requiredEnv.filter((name) => !process.env[name] || !String(process.env[name]).trim());

  // Throw an error if any required environment variables are missing
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

module.exports = {
  isTestEnvironment: isTest,
  port: Number.parseInt(process.env.PORT || '3000', 10),
  mongoUri: isTest ? (process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/airlineDB') : process.env.MONGODB_URI,
  sessionSecret: isTest ? (process.env.SESSION_SECRET || 'test-session-secret') : process.env.SESSION_SECRET,
  adminEmail: process.env.ADMIN_EMAIL || ''
};
