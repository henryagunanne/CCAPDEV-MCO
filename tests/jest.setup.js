
const db = require('./setup');  // Import the test database setup module

// Connect to the in-memory database before running tests
beforeAll(async () => {
  // Create a SuperTest agent for maintaining session state
  //global.agent = request.agent(app);

  await db.connect();
});

// Clear database after each test
afterEach(async () => {
  await db.clearDatabase();
});

// Close database connection after all tests
afterAll(async () => {
  await db.closeDatabase();
});

