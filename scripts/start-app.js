/**
 * This script is used to start the application in either development or production mode.
 * Usage: node scripts/start-app.js <mode>
 * where <mode> is either 'development' or 'production'.
 */

const mode = process.argv[2];
if (!['development', 'production'].includes(mode)) {
  throw new Error('Specify an application mode: development or production.');
}

process.env.NODE_ENV = mode;
require('../server');
