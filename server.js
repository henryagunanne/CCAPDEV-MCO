const server = require('./app');
const PORT = 3000;  // Server port


// Start Server
if (process.env.NODE_ENV !== 'test') {
  server.listen(PORT, () => {
      console.log(`🚀 Server running at http://localhost:${PORT}`);
  });
}

// export the server
module.exports = server;