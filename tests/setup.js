const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server'); // In-memory MongoDB server
const logger = require('../logs/logger'); 

let mongod;

// Connect to in-memory MongoDB
module.exports.connect = async () => {
  process.env.NODE_ENV = 'test'; // set node environment to test mode

  mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();

  await mongoose.connect(uri)
  .then(async () => {
    logger.info('✅ MongoDB connected.');
  })
  .catch(err => console.error('MongoDB connection error:', err));
};

// Close the database and stop the in-memory server
module.exports.closeDatabase = async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
  await mongod.stop();
};

// Clear all collections in the database
module.exports.clearDatabase = async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany();
  }
};
