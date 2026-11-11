const mongoose = require('mongoose');

const TRIP_TYPES = ['One-Way', 'Round-Trip'];
const TRAVEL_CLASSES = ['Economy', 'Premium Economy', 'Business', 'First'];
const MEALS = ['None', 'Vegetarian', 'Non-Vegetarian', 'Vegan', 'Gluten-Free'];
const PASSENGER_FIELDS = new Set([
  'fullName', 'age', 'gender', 'passport', 'seatNumber',
  'returnSeatNumber', 'meal', 'baggageAllowance'
]);

// Custom error class for booking input validation errors
class BookingInputError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'BookingInputError';
    this.statusCode = statusCode;
  }
}


/** * Recursively checks an object for unsafe keys that could lead to NoSQL injection or prototype pollution.
 * Throws a BookingInputError if any unsafe keys are found.
 * @param {object} value - The object to check for unsafe keys.
 */
function assertSafeKeys(value) {
  if (!value || typeof value !== 'object') return;
  for (const [key, nested] of Object.entries(value)) {
    if (key.startsWith('$') || key.includes('.') || key === '__proto__' ||
        key === 'constructor' || key === 'prototype') {
      throw new BookingInputError('Request contains an invalid field.');
    }
    assertSafeKeys(nested);
  }
}


/** * Asserts that an object only contains allowed keys.
 * Throws a BookingInputError if any unexpected keys are found.
 * @param {object} value - The object to check for allowed keys.
 * @param {Set<string>} allowed - A set of allowed key names.
 * @param {string} label - A label for the object being checked, used in error messages.
 */
function assertAllowedKeys(value, allowed, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new BookingInputError(`${label} must be an object.`);
  }
  if (Object.keys(value).some(key => !allowed.has(key))) {
    throw new BookingInputError(`Unexpected ${label.toLowerCase()} field.`);
  }
}


/** * Parses a raw passenger list input, validating that it is a JSON array of passengers.
 * Throws a BookingInputError if the input is invalid or does not meet the required constraints.
 * @param {string|Array} raw - The raw passenger list input, either as a JSON string or an array.
 * @returns {Array} - The parsed and validated array of passengers.
 */
function parsePassengerList(raw) {
  let passengers = raw;
  if (typeof raw === 'string') {
    try {
      passengers = JSON.parse(raw);
    } catch {
      throw new BookingInputError('Passenger information is invalid.');
    }
  }
  if (!Array.isArray(passengers) || passengers.length < 1 || passengers.length > 10) {
    throw new BookingInputError('Select between 1 and 10 passengers.');
  }
  return passengers;
}


/** * Validates a seat number string, ensuring it matches the expected format (row 1-30 and column A-J).
 * Throws a BookingInputError if the seat number is invalid or missing when required.
 * @param {string|null|undefined} seatNumber - The seat number to validate.
 * @param {boolean} required - Whether the seat number is required (default: true).
 * @returns {string|null} - The validated seat number, or null if not required and not provided.
 */
function validateSeatNumber(seatNumber, required = true) {
  if (seatNumber === null || seatNumber === undefined || seatNumber === '') {
    if (required) throw new BookingInputError('A seat is required for every passenger and flight.');
    return null;
  }
  if (typeof seatNumber !== 'string' ||
      !/^(?:[1-9]|[12][0-9]|30)[A-J]$/.test(seatNumber)) {
    throw new BookingInputError('Seat number must be a row from 1 to 30 and a column from A to J.');
  }
  return seatNumber;
}


/** * Validates a list of passengers, ensuring each passenger has valid fields and no duplicates.
 * Throws a BookingInputError if any passenger data is invalid or if there are duplicate passport numbers.
 * @param {Array} raw - The raw passenger list input, either as a JSON string or an array.
 * @param {string} tripType - The trip type ('One-Way' or 'Round-Trip') to determine seat validation rules.
 * @returns {Array} - The validated and normalized array of passengers.
 */
function validatePassengers(raw, tripType) {
  const passengers = parsePassengerList(raw);
  const normalizedPassengers = passengers.map(passenger => {
    assertAllowedKeys(passenger, PASSENGER_FIELDS, 'Passenger');
    if (typeof passenger.fullName !== 'string' ||
        !/^[\p{L}][\p{L}\p{M}' -]{1,98}$/u.test(passenger.fullName.trim())) {
      throw new BookingInputError('Passenger name is invalid.');
    }
    if (!Number.isInteger(passenger.age) || passenger.age < 0 || passenger.age > 120) {
      throw new BookingInputError('Passenger age must be a whole number from 0 to 120.');
    }
    if (!['Male', 'Female', 'Other'].includes(passenger.gender)) {
      throw new BookingInputError('Passenger gender is invalid.');
    }
    if (typeof passenger.passport !== 'string' ||
        !/^[A-Za-z0-9]{6,9}$/.test(passenger.passport.trim())) {
      throw new BookingInputError('Passport number must contain 6 to 9 alphanumeric characters.');
    }
    if (passenger.meal !== undefined && !MEALS.includes(passenger.meal)) {
      throw new BookingInputError('Meal selection is invalid.');
    }
    const baggage = passenger.baggageAllowance === undefined ? 0 : passenger.baggageAllowance;
    if (!Number.isInteger(baggage) || baggage < 0 || baggage > 40) {
      throw new BookingInputError('Baggage allowance must be a whole number from 0 to 40 kg.');
    }
    const seatNumber = validateSeatNumber(passenger.seatNumber);
    const returnSeatNumber = tripType === 'Round-Trip'
      ? validateSeatNumber(passenger.returnSeatNumber)
      : validateSeatNumber(passenger.returnSeatNumber, false);
    if (tripType === 'One-Way' && returnSeatNumber) {
      throw new BookingInputError('A return seat is not allowed for a one-way reservation.');
    }
    return {
      fullName: passenger.fullName.trim(),
      age: passenger.age,
      gender: passenger.gender,
      passport: passenger.passport.trim().toUpperCase(),
      seatNumber,
      returnSeatNumber,
      meal: passenger.meal || 'None',
      baggageAllowance: baggage
    };
  });
  const passports = normalizedPassengers.map(passenger => passenger.passport);
  if (new Set(passports).size !== passports.length) {
    throw new BookingInputError('Each passenger must have a different passport number.');
  }
  return normalizedPassengers;
}


/** * Validates that a given value is a valid MongoDB ObjectId string.
 * Throws a BookingInputError if the value is not a valid ObjectId.
 * @param {string} value - The value to validate as an ObjectId.
 * @param {string} label - A label for the value being validated, used in error messages.
 * @returns {string} - The validated ObjectId string.
 */
function validateObjectId(value, label) {
  if (typeof value !== 'string' || !mongoose.isValidObjectId(value)) {
    throw new BookingInputError(`${label} is invalid.`);
  }
  return value;
}


/** * Validates the flight selection and passenger information for a booking request.
 * Throws a BookingInputError if any part of the selection is invalid or inconsistent.
 * @param {object} params - The parameters for the booking request.
 * @param {string} params.flight - The outbound flight ID.
 * @param {string|null|undefined} params.returnFlight - The return flight ID (if applicable).
 * @param {string} params.tripType - The trip type ('One-Way' or 'Round-Trip').
 * @param {string} params.travelClass - The travel class ('Economy', 'Premium Economy', 'Business', 'First').
 * @param {Array|string} params.passengers - The passenger list, either as an array or a JSON string.
 * @returns {object} - An object containing validated flight IDs, trip type, travel class, and normalized passengers.
 */
function validateFlightSelection({ flight, returnFlight, tripType, travelClass, passengers }) {
  if (!TRIP_TYPES.includes(tripType)) {
    throw new BookingInputError('Trip type is invalid.');
  }
  if (!TRAVEL_CLASSES.includes(travelClass)) {
    throw new BookingInputError('Travel class is invalid.');
  }
  const outboundId = validateObjectId(flight, 'Flight ID');
  const returnId = returnFlight === undefined || returnFlight === null || returnFlight === ''
    ? null
    : validateObjectId(returnFlight, 'Return flight ID');
  if ((tripType === 'Round-Trip') !== Boolean(returnId)) {
    throw new BookingInputError('Selected flights do not match the trip type.');
  }
  if (returnId && returnId === outboundId) {
    throw new BookingInputError('Outbound and return flights must be different.');
  }
  const normalizedPassengers = validatePassengers(passengers, tripType);
  for (const key of ['seatNumber', 'returnSeatNumber']) {
    const selected = normalizedPassengers.map(passenger => passenger[key]).filter(Boolean);
    if (new Set(selected).size !== selected.length) {
      throw new BookingInputError('Each passenger must have a different seat on each flight.');
    }
  }
  return {
    flightIds: returnId ? [outboundId, returnId] : [outboundId],
    tripType,
    travelClass,
    passengers: normalizedPassengers
  };
}

const CREATE_FIELDS = new Set([
  'flight', 'returnFlight', 'tripType', 'travelClass', 'passengers',
  'totalAmount', 'totalPrice', 'price'
]);
const EDIT_FIELDS = new Set([
  'passengers', 'passengersJSON', 'totalAmount', 'totalPrice', 'price',
  'reservationId', 'flight', 'returnFlight'
]);


/** * Validates the request body for creating a new booking.
 * Throws a BookingInputError if any part of the request body is invalid or contains unexpected fields.
 * @param {object} body - The request body to validate.
 * @returns {object} - An object containing validated flight selection and passenger information.
 */
function validateCreateBody(body) {
  assertSafeKeys(body);
  assertAllowedKeys(body, CREATE_FIELDS, 'Request');
  return validateFlightSelection(body);
}


/** * Validates the request body for editing an existing booking.
 * Throws a BookingInputError if any part of the request body is invalid or contains unexpected fields.
 * @param {object} body - The request body to validate.
 * @param {string} tripType - The trip type ('One-Way' or 'Round-Trip') to determine seat validation rules.
 * @returns {Array} - The validated and normalized array of passengers.
 */
function validateEditBody(body, tripType) {
  assertSafeKeys(body);
  assertAllowedKeys(body, EDIT_FIELDS, 'Request');
  if (body.passengers !== undefined && body.passengersJSON !== undefined) {
    throw new BookingInputError('Submit passenger information only once.');
  }
  return validatePassengers(
    body.passengers === undefined ? body.passengersJSON : body.passengers,
    tripType
  );
}

module.exports = {
  BookingInputError,
  assertSafeKeys,
  validateCreateBody,
  validateEditBody,
  validateObjectId,
  validateSeatNumber,
  validatePassengers,
  TRIP_TYPES,
  TRAVEL_CLASSES,
  MEALS
};
