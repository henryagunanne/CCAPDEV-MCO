const {
  encryptPassport,
  decryptPassport,
  fingerprintPassport,
  maskPassport,
  getStoredPassport
} = require('../services/passportEncryption');
const {
  calculateWorkingDayDeadline,
  calculatePrivacyDeadlines
} = require('../services/privacyDeadlines');
const { validatePassengers, BookingInputError } = require('../services/bookingValidation');
const Reservation = require('../models/Reservation');
const { isTodayOrFutureInManila } = require('../services/manilaDate');
const {
  findReservationActions,
  subtractCalendarMonths,
  subtractCalendarYears
} = require('../services/retentionService');

describe('MCO2 passenger privacy controls', () => {
  afterEach(() => jest.restoreAllMocks());

  test('encrypts passport values with authenticated AES-256-GCM and masks to the last three characters', () => {
    const first = encryptPassport('AB123456');
    const second = encryptPassport('AB123456');
    expect(first.algorithm).toBe('aes-256-gcm');
    expect(first.iv).not.toBe(second.iv);
    expect(decryptPassport(first)).toBe('AB123456');
    expect(fingerprintPassport('AB123456')).toBe(fingerprintPassport('ab123456'));
    expect(maskPassport('AB123456')).toBe('***456');
    expect(getStoredPassport({ passportEncrypted: first })).toBe('AB123456');
    expect(() => decryptPassport({ ...first, ciphertext: Buffer.from('tampered').toString('base64') }))
      .toThrow();
  });

  test('requires separate consent for special-meal preferences', () => {
    const passenger = {
      fullName: 'Anna Rivera',
      ageCategory: 'Adult 12+',
      gender: 'Female',
      passport: 'AB123456',
      seatNumber: '1A',
      meal: 'Vegan',
      mealConsent: false,
      baggageAllowance: 0
    };
    expect(() => validatePassengers([passenger], 'One-Way')).toThrow(BookingInputError);
    expect(validatePassengers([{ ...passenger, mealConsent: true }], 'One-Way')[0].mealConsent)
      .toBe(true);
    expect(() => validatePassengers([{ ...passenger, ageCategory: '12' }], 'One-Way'))
      .toThrow('Select a valid passenger age category.');
  });

  test('counts Philippine working days and requires a versioned calendar', () => {
    const calendars = new Map([[2025, {
      version: 'PH-2025-v1',
      holidays: [{ date: '2025-01-07', name: 'Holiday' }]
    }]]);
    const due = calculateWorkingDayDeadline(
      new Date('2025-01-03T08:00:00.000Z'),
      5,
      calendars
    );
    expect(due.deadline.toISOString()).toBe('2025-01-13T15:59:59.999Z');
    expect(due.calendarVersions).toEqual(['PH-2025-v1']);
    expect(calculatePrivacyDeadlines(new Date('2025-01-03T08:00:00.000Z'), calendars)
      .acknowledgementCalendarVersions).toEqual(['PH-2025-v1']);
    expect(() => calculateWorkingDayDeadline(
      new Date('2024-12-30T00:00:00.000Z'),
      5,
      calendars
    )).toThrow('An approved holiday calendar is missing');
  });

  test('uses calendar-month and calendar-year cutoffs', () => {
    expect(subtractCalendarMonths(new Date('2025-03-31T12:00:00.000Z'), 1).toISOString())
      .toBe('2025-02-28T12:00:00.000Z');
    expect(subtractCalendarYears(new Date('2024-02-29T12:00:00.000Z'), 1).toISOString())
      .toBe('2023-02-28T12:00:00.000Z');
  });

  test('compares travel dates against the current Philippine calendar day', () => {
    const now = new Date('2025-01-03T16:30:00.000Z');
    expect(isTodayOrFutureInManila(new Date('2025-01-03T00:00:00.000Z'), now)).toBe(false);
    expect(isTodayOrFutureInManila(new Date('2025-01-04T00:00:00.000Z'), now)).toBe(true);
    expect(isTodayOrFutureInManila(new Date('2025-01-03T16:00:00.000Z'), now)).toBe(true);
  });

  test('allows retained passengers without fields removed by the retention policy', () => {
    const reservation = new Reservation({
      bookingReference: 'ABC123',
      flight: ['507f1f77bcf86cd799439011'],
      passengers: [{ fullName: 'Passenger 1' }],
      price: 100
    });
    expect(reservation.passengers[0].validateSync()).toBeUndefined();
  });

  test('removes age, passport, and meal data at 30 days after the last flight', async () => {
    jest.spyOn(Reservation, 'find').mockReturnValue({
      select: () => ({
        populate: () => ({
          lean: async () => [{
            _id: 'reservation-1',
            tripType: 'One-Way',
            travelClass: 'Economy',
            flight: [{ completedAt: new Date('2025-01-02T00:00:00.000Z') }],
            passengers: [{
              _id: 'passenger-1',
              fullName: 'Anna Rivera',
              ageCategory: 'Adult 12+',
              passport: 'AB123456',
              passportEncrypted: { ciphertext: 'encrypted' },
              passportFingerprint: 'fingerprint',
              passportLast3: '456',
              mealConsent: { granted: true },
              meal: 'Vegan'
            }]
          }]
        })
      })
    });

    const actions = await findReservationActions(new Date('2025-02-01T00:00:00.000Z'));
    const passengerUpdate = actions[0].passengerUpdates[0].update;
    expect(passengerUpdate.$unset).toMatchObject({
      'passengers.$[passenger].ageCategory': '',
      'passengers.$[passenger].passportEncrypted': '',
      'passengers.$[passenger].passportFingerprint': '',
      'passengers.$[passenger].passportLast3': '',
      'passengers.$[passenger].mealConsent': ''
    });
    expect(passengerUpdate.$set['passengers.$[passenger].meal']).toBe('None');
    expect(passengerUpdate.$set['passengers.$[passenger].fullName']).toBeUndefined();
  });

  test('anonymizes passenger fields at 12 months and finalizes operations after flight completion', async () => {
    jest.spyOn(Reservation, 'find').mockReturnValue({
      select: () => ({
        populate: () => ({
          lean: async () => [{
            _id: 'reservation-2',
            tripType: 'One-Way',
            travelClass: 'Economy',
            flight: [{ completedAt: new Date('2024-02-01T00:00:00.000Z') }],
            passengers: [{
              _id: 'passenger-2',
              fullName: 'Anna Rivera',
              gender: 'Female',
              seatNumber: '1A',
              baggageAllowance: 10,
              checkedIn: true,
              boardingPass: { outbound: 'BP-123456', return: null }
            }]
          }]
        })
      })
    });

    const actions = await findReservationActions(new Date('2025-02-01T00:00:00.000Z'));
    const action = actions[0];
    expect(action.reservationUpdate.$unset).toEqual({ tripType: '', travelClass: '' });
    const passengerUpdate = action.passengerUpdates[0].update;
    expect(passengerUpdate.$set).toMatchObject({
      'passengers.$[passenger].fullName': 'Passenger 1',
      'passengers.$[passenger].checkedIn': false,
      'passengers.$[passenger].boardingPass': null
    });
    expect(passengerUpdate.$unset).toMatchObject({
      'passengers.$[passenger].gender': '',
      'passengers.$[passenger].seatNumber': '',
      'passengers.$[passenger].baggageAllowance': ''
    });
  });
});
