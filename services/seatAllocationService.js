const crypto = require('crypto');
const AircraftLayout = require('../models/AircraftLayout');

const COLUMNS = Object.freeze(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']);
const COLUMN_POSITIONS = Object.freeze({
  A: 'WINDOW', B: 'MIDDLE', C: 'AISLE', D: 'AISLE', E: 'MIDDLE',
  F: 'MIDDLE', G: 'AISLE', H: 'AISLE', I: 'MIDDLE', J: 'WINDOW'
});
const CLASS_ORDER = ['First', 'Business', 'Premium Economy', 'Economy'];
const CLASS_PERCENTAGES = { First: 5, Business: 10, 'Premium Economy': 15, Economy: 70 };
const CLASS_CODES = { First: 'F', Business: 'J', 'Premium Economy': 'W', Economy: 'Y' };
const MAX_CAPACITY = 300;
const VERSION = '1.0.0';


/**
 * Allocates seat counts for each travel class based on the total capacity and predefined percentages.
 * Ensures that the total allocated seats match the requested capacity, using the largest remainder method.
 *
 * @param {number} capacity - The total number of seats to allocate.
 * @returns {Object} An object mapping each travel class to its allocated seat count.
 */
function allocateClassCounts(capacity) {
  const counts = {};
  const remainders = [];
  let assigned = 0;
  for (const name of CLASS_ORDER) {
    const exact = capacity * CLASS_PERCENTAGES[name] / 100;
    counts[name] = Math.floor(exact);
    assigned += counts[name];
    remainders.push({ name, remainder: exact - counts[name] });
  }
  remainders.sort((a, b) => b.remainder - a.remainder ||
    CLASS_ORDER.indexOf(a.name) - CLASS_ORDER.indexOf(b.name));
  for (let i = 0; i < capacity - assigned; i += 1) counts[remainders[i].name] += 1;
  return counts;
}


/**
 * Generates a seat map for the given capacity, assigning seats to travel classes based on allocated counts.
 * Seats are labeled with row and column identifiers, and their positions (window, middle, aisle) are determined.
 *
 * @param {number} capacity - The total number of seats to generate.
 * @returns {Array} An array of seat objects, each containing seatNumber, row, column, position, travelClass, and classCode.
 * @throws {RangeError} If the capacity is not an integer between 1 and MAX_CAPACITY.
 */
function generateSeats(capacity) {
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > MAX_CAPACITY) {
    throw new RangeError(`Seat capacity must be an integer from 1 to ${MAX_CAPACITY}.`);
  }
  const counts = allocateClassCounts(capacity);
  const seats = [];
  let index = 0;
  for (const travelClass of CLASS_ORDER) {
    for (let n = 0; n < counts[travelClass]; n += 1, index += 1) {
      const row = Math.floor(index / COLUMNS.length) + 1;
      const column = COLUMNS[index % COLUMNS.length];
      seats.push({
        seatNumber: `${row}${column}`,
        row,
        column,
        position: COLUMN_POSITIONS[column],
        travelClass,
        classCode: CLASS_CODES[travelClass]
      });
    }
  }
  // Keep physical row order for rendering while preserving each seat's class allocation.
  seats.sort((a, b) => a.row - b.row || COLUMNS.indexOf(a.column) - COLUMNS.indexOf(b.column));
  return seats;
}


/**
 * Builds layout attributes for a given aircraft type and seat capacity, including a unique configuration ID and hash.
 *
 * @param {string} aircraftType - The type of the aircraft (e.g., "Boeing 737").
 * @param {number} capacity - The total number of seats to generate for the layout.
 * @returns {Object} An object containing layout attributes such as configurationId, aircraftType, version, seatCapacity, seats, layoutMode, sourceConfigurationId, sourceHash, and active status.
 */
function buildLayoutAttributes(aircraftType, capacity) {
  const seats = generateSeats(capacity);
  const normalizedAircraft = String(aircraftType).toUpperCase().replace(/[^A-Z0-9]/g, '');
  const sourceConfigurationId = `DYNAMIC-${normalizedAircraft}-V1`;
  const sourceHash = crypto.createHash('sha256').update(JSON.stringify(seats)).digest('hex');
  return {
    configurationId: `${sourceConfigurationId}-C${capacity}`,
    aircraftType: String(aircraftType).trim(),
    version: VERSION,
    seatCapacity: capacity,
    seats,
    layoutMode: 'DYNAMIC_CAPACITY',
    sourceConfigurationId,
    sourceHash,
    active: true
  };
}


/**
 * Ensures that an aircraft layout exists in the database for the given aircraft type and capacity.
 * If the layout does not exist, it is created. If it exists but does not match the requested configuration, an error is thrown.
 *
 * @param {string} aircraftType - The type of the aircraft (e.g., "Boeing 737").
 * @param {number} capacity - The total number of seats to generate for the layout.
 * @returns {Promise<Object>} A promise that resolves to the existing or newly created aircraft layout document.
 * @throws {Error} If an existing layout does not match the requested configuration.
 */
async function ensureAircraftLayout(aircraftType, capacity) {
  const attributes = buildLayoutAttributes(aircraftType, capacity);
  const layout = await AircraftLayout.findOneAndUpdate(
    { configurationId: attributes.configurationId },
    { $setOnInsert: attributes },
    { new: true, upsert: true }
  );
  if (layout.seatCapacity !== capacity || layout.aircraftType !== String(aircraftType).trim()) {
    throw new Error(`Existing aircraft layout ${attributes.configurationId} does not match the requested flight configuration.`);
  }
  return layout;
}

module.exports = {
  COLUMNS, COLUMN_POSITIONS, CLASS_ORDER, CLASS_PERCENTAGES, CLASS_CODES,
  MAX_CAPACITY, allocateClassCounts, generateSeats, buildLayoutAttributes, ensureAircraftLayout
};
