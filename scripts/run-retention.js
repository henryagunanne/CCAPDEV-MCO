/**
 * This script runs the retention process for reservations.
 * It can be run in dry-run mode or apply mode.
 * Usage:
 *   node run-retention.js [--apply] [--confirm=RUN-MCO2-C18]
 * 
 * Options:
 *   --apply: Apply the retention changes to the database.
 *   --confirm=RUN-MCO2-C18: Required confirmation to run in apply mode.
 */

const mongoose = require('mongoose');
const { mongoUri } = require('../config/env');
const { runRetention } = require('../services/retentionService');

async function main() {
  const apply = process.argv.includes('--apply');
  if (apply && !process.argv.includes('--confirm=RUN-MCO2-C18')) {
    throw new Error('Apply mode requires --confirm=RUN-MCO2-C18.');
  }
  await mongoose.connect(mongoUri);
  try {
    const report = await runRetention({ apply });
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error('Retention run failed.', error.code || error.name);
    process.exitCode = 1;
  });
}

module.exports = { main };
