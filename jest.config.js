module.exports = {
    testEnvironment: "node",    // Use Node.js environment
    setupFilesAfterEnv: ["./tests/jest.setup.js"],  // Path to setup file
    testTimeout: 30000  // Increase timeout for async operations
};