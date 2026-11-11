const SEAT_TARIFFS = Object.freeze({
  First: 5000,
  Business: 3000,
  'Premium Economy': 1700,
  Economy: 1500
});
const MEAL_TARIFF = 150;
const BAGGAGE_TARIFF_PER_KG = 50;

/**
 * Calculate the total price of a reservation based on flights, passengers, and travel class.
 * @param {Array} flights - Array of flight objects with price information.
 * @param {Array} passengers - Array of passenger objects with meal and baggage information.
 * @param {string} travelClass - The travel class for the reservation (e.g., 'Economy', 'Business').
 * @returns {number} - The total price of the reservation.
 */
function calculateReservationPrice(flights, passengers, travelClass) {
  const fares = flights.reduce((sum, flight) => sum + Number(flight.price), 0);
  const passengerCount = passengers.length;
  const meals = passengers.reduce((sum, passenger) =>
    sum + (passenger.meal !== 'None' ? MEAL_TARIFF : 0), 0);
  const baggage = passengers.reduce((sum, passenger) =>
    sum + passenger.baggageAllowance * BAGGAGE_TARIFF_PER_KG, 0);
  const seatSelections = passengers.reduce((sum, passenger) =>
    sum + SEAT_TARIFFS[travelClass] *
      (passenger.returnSeatNumber ? 2 : 1), 0);

  const total = fares * passengerCount + meals + baggage + seatSelections;
  if (!Number.isFinite(total) || total < 0) {
    throw new Error('Calculated reservation price is invalid.');
  }
  return Math.round(total * 100) / 100;
}

module.exports = {
  calculateReservationPrice,
  SEAT_TARIFFS,
  MEAL_TARIFF,
  BAGGAGE_TARIFF_PER_KG
};
