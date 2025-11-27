const server = require('./app');
const PORT = 3000;  // Server port
const logger = require('./logs/logger');  


// Start Server
if (process.env.NODE_ENV !== 'test') {
  server.listen(PORT, () => {
    logger.info(`🚀 Server running at http://localhost:${PORT}`);
  });
}

// export the server
module.exports = server;