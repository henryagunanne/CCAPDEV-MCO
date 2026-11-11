const server = require('./app');
const { port, isTestEnvironment } = require('./config/env');
const logger = require('./logs/logger');

// Start Server
if (!isTestEnvironment) {
  server.listen(port, () => {
    logger.info(`🚀 Server running at http://localhost:${port}`);
  });
}

// export the server
module.exports = server;