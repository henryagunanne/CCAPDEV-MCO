const server = require('./app');
const PORT = 3000;  // Server port


// Start Server
server.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
});

