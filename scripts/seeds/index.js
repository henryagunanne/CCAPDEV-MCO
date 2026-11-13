#!/usr/bin/env node
const mongoose = require('mongoose');
const { mongoUri } = require('../../config/env');

const seedSteps = [
  ['users', require('./users.seed')],
  ['aircraft layouts', require('./aircraftLayouts.seed')],
  ['flights', require('./flights.seed')],
  ['reservations', require('./reservations.seed')],
  ['seat allocations', require('./seatAllocations.seed')],
  ['booking integrity', require('./bookingIntegrityState.seed')],
  ['popular flights', require('./popularFlights.seed')]
];

async function run() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Normal fixture seeding is disabled in production.');
  }
  await mongoose.connect(mongoUri);
  try {
    console.log('Starting non-destructive Archers Airline seed run...');
    for (const [name, seed] of seedSteps) {
      console.log(`→ ${name}`);
      await seed();
    }
    console.log('Seed run completed. Existing unrelated records were not deleted.');
  } finally {
    await mongoose.disconnect();
  }
}

run().catch(error => {
  console.error('Seed run failed:', error.message);
  mongoose.disconnect().finally(() => { process.exitCode = 1; });
});
