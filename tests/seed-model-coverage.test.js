const fs = require('fs');
const path = require('path');
const coverage = require('../scripts/seeds/model-coverage');

describe('seed model coverage', () => {
  test('documents a seed module or explicit exclusion for every Mongoose model', () => {
    const modelDirectory = path.join(__dirname, '..', 'models');
    const modelNames = fs.readdirSync(modelDirectory)
      .filter(file => file.endsWith('.js'))
      .map(file => file.replace(/\.js$/, ''))
      .map(file => file === 'popularFlight' ? 'PopularFlight' : file);
    expect(Object.keys(coverage).sort()).toEqual(modelNames.sort());
    for (const entry of Object.values(coverage)) {
      if (entry.seed) {
        expect(fs.existsSync(path.join(__dirname, '..', 'scripts', 'seeds', entry.seed))).toBe(true);
      } else {
        expect(typeof entry.excluded).toBe('string');
      }
    }
  });
});
