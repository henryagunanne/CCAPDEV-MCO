const { generateSeats, COLUMNS } = require('../services/seatAllocationService');

describe('shared ten-column aircraft layout', () => {
  test('generates A–J identifiers for the first three complete rows', () => {
    expect(generateSeats(30).map(seat => seat.seatNumber)).toEqual(
      Array.from({ length: 3 }, (_, row) => COLUMNS.map(column => `${row + 1}${column}`)).flat()
    );
  });

  test('generates exactly the configured capacity and no duplicate identifiers', () => {
    for (const capacity of [1, 10, 11, 100, 120, 300]) {
      const seats = generateSeats(capacity);
      const identifiers = seats.map(seat => seat.seatNumber);
      expect(identifiers).toHaveLength(capacity);
      expect(new Set(identifiers).size).toBe(capacity);
      expect(identifiers.every(value => /^(?:[1-9]|[12][0-9]|30)[A-J]$/.test(value))).toBe(true);
    }
  });

  test('rejects capacity outside the supported 1–300 range', () => {
    expect(() => generateSeats(0)).toThrow(RangeError);
    expect(() => generateSeats(301)).toThrow(RangeError);
    expect(() => generateSeats(2.5)).toThrow(RangeError);
  });

  test('returns seats in row-major A–J display order', () => {
    const seats = generateSeats(25);
    expect(seats.slice(0, 10).map(seat => seat.seatNumber)).toEqual(COLUMNS.map(c => `1${c}`));
    expect(seats.slice(10, 20).map(seat => seat.seatNumber)).toEqual(COLUMNS.map(c => `2${c}`));
    expect(seats.slice(20).map(seat => seat.seatNumber)).toEqual(['3A', '3B', '3C', '3D', '3E']);
  });
});
