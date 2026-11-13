const https = require('https');
const {
  port,
  isTestEnvironment,
  tlsMode,
  tlsCertPath,
  tlsKeyPath
} = require('./config/env');
const { shouldUseLocalHttps, loadTlsOptions } = require('./config/tls');
const logger = require('./logs/logger');
const isProduction = process.env.NODE_ENV === 'production';

// Determine whether to use local HTTPS based on the environment and TLS mode
const useHttps = shouldUseLocalHttps({
  isTestEnvironment,
  isProduction,
  tlsMode
});

// Load TLS options if HTTPS is to be used
let tlsOptions = null;
if (useHttps) {
  try {
    tlsOptions = loadTlsOptions({ certPath: tlsCertPath, keyPath: tlsKeyPath });
  } catch (error) {
    console.error(error.message);
    throw error;
  }
}

const app = require('./app');   // Import the Express app from app.js

if (!isTestEnvironment) { // Start the server only if not in a test environment
  // Start the server with or without HTTPS based on the configuration
  const server = useHttps ? https.createServer(tlsOptions, app) : app;

  // Handle server errors and log them
  server.once('error', error => {
    logger.error('Server failed to start.', {
      code: error.code || 'SERVER_START_ERROR'
    });
    process.exitCode = 1;
  });
  server.listen(port, () => {
    const protocol = useHttps ? 'https' : 'http';
    logger.info(`Server running at ${protocol}://localhost:${port}`);
  });
}

// Export the app for testing purposes
module.exports = app;