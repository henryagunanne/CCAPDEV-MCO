const request = require('supertest');
const app = require('../server');
const Reservation = require('../models/Reservation');
const Flight = require('../models/Flight');
const User = require('../models/User');
const AircraftLayout = require('../models/AircraftLayout');
const SeatAllocation = require('../models/SeatAllocation');
const BookingIntegrityState = require('../models/BookingIntegrityState');

describe('Booking integrity', () => {
  let agent;
  let userId;
  let flight;

  async function createFlight({ price = 148, capacity = 180, date = '2030-12-20' } = {}) {
    const layoutSuffix = `${capacity}-${Math.random().toString(36).slice(2, 10)}`;
    const seats = Array.from({ length: capacity }, (_, index) => {
      const row = Math.floor(index / 10) + 1;
      const column = String.fromCharCode(65 + (index % 10));
      return {
        seatNumber: `${row}${column}`,
        row,
        column,
        position: ['C', 'D', 'G', 'H'].includes(column) ? 'AISLE' :
          ['A', 'J'].includes(column) ? 'WINDOW' : 'MIDDLE',
        travelClass: 'Economy',
        classCode: 'Y'
      };
    });
    const layout = await AircraftLayout.create({
      configurationId: `test-layout-${layoutSuffix}`,
      aircraftType: 'Airbus A321',
      version: `test-${layoutSuffix}`,
      seatCapacity: capacity,
      seats,
      layoutMode: 'DYNAMIC_CAPACITY',
      sourceConfigurationId: `test-source-${layoutSuffix}`,
      sourceHash: `test-hash-${layoutSuffix}`
    });
    return Flight.create({
      flightNumber: `AA${Math.floor(Math.random() * 900000 + 100000)}`,
      origin: 'Manila (MNL)',
      destination: 'Hong Kong (HKG)',
      departureDate: date,
      departureTime: '08:30',
      arrivalTime: '10:45',
      aircraft: 'Airbus A321',
      seatCapacity: capacity,
      aircraftLayoutId: layout._id,
      price,
      status: 'Scheduled'
    });
  }

  function passenger(overrides = {}) {
    return {
      fullName: 'Anna Rivera',
      age: 29,
      gender: 'Female',
      passport: 'P100002',
      seatNumber: '7C',
      meal: 'None',
      baggageAllowance: 0,
      ...overrides
    };
  }

  async function book(overrides = {}) {
    return agent.post('/reservations/create').send({
      flight: String(flight._id),
      tripType: 'One-Way',
      travelClass: 'Economy',
      passengers: [passenger()],
      totalAmount: 1,
      ...overrides
    });
  }

  beforeEach(async () => {
    agent = request.agent(app);
    const user = await User.create({
      firstName: 'Test',
      lastName: 'User',
      email: 'booking-test@example.com',
      password: 'password123',
      dateOfBirth: new Date('1990-01-01')
    });
    userId = String(user._id);
    await agent.post('/users/login').send({
      email: 'booking-test@example.com',
      password: 'password123'
    });
    await BookingIntegrityState.create({
      _id: 'booking-integrity-v1',
      version: 1,
      ready: true,
      indexName: 'unique_flight_seat',
      verifiedAt: new Date()
    });
    await SeatAllocation.init();
    flight = await createFlight();
  });

  it('calculates and persists price from stored fares and approved tariffs', async () => {
    const response = await book({
      passengers: [
        passenger({ meal: 'Vegan', baggageAllowance: 25 }),
        passenger({
          fullName: 'Luis Rivera',
          age: 30,
          gender: 'Male',
          passport: 'P100003',
          seatNumber: '7D',
          meal: 'Vegetarian',
          baggageAllowance: 25
        })
      ],
      totalAmount: 999999
    });

    expect(response.statusCode).toBe(200);
    const reservation = await Reservation.findOne({ userId });
    expect(reservation.price).toBe(6096);
  });

  it('rejects malformed, injected, unexpected, and invalid passenger inputs', async () => {
    const malformedId = await agent.post('/reservations/create').send({
      flight: 'not-an-object-id',
      tripType: 'One-Way',
      travelClass: 'Economy',
      passengers: [passenger()]
    });
    expect(malformedId.statusCode).toBe(400);

    const injection = await book({
      passengers: [{ ...passenger(), '$where': 'return true' }]
    });
    expect(injection.statusCode).toBe(400);

    const dottedKey = await book({
      passengers: [{ ...passenger(), 'profile.name': 'changed' }]
    });
    expect(dottedKey.statusCode).toBe(400);

    const badPassport = await book({ passengers: [passenger({ passport: 'A-12' })] });
    expect(badPassport.statusCode).toBe(400);

    const duplicatePassport = await book({
      passengers: [
        passenger({ passport: 'P300001' }),
        passenger({ fullName: 'Luis Rivera', passport: 'p300001', seatNumber: '7D' })
      ]
    });
    expect(duplicatePassport.statusCode).toBe(400);

    const badSeat = await book({ passengers: [passenger({ seatNumber: '31A' })] });
    expect(badSeat.statusCode).toBe(400);

    const badBaggage = await book({ passengers: [passenger({ baggageAllowance: 41 })] });
    expect(badBaggage.statusCode).toBe(400);

    const extraField = await book({ admin: true });
    expect(extraField.statusCode).toBe(400);
    expect(await Reservation.countDocuments()).toBe(0);
  });

  it('enforces database uniqueness for simultaneous seat claims and returns 409', async () => {
    const results = await Promise.all([book(), book()]);
    expect(results.map(result => result.statusCode).sort()).toEqual([200, 409]);
    expect(await SeatAllocation.countDocuments({ flightId: flight._id })).toBe(1);
    const updatedFlight = await Flight.findById(flight._id);
    expect(updatedFlight.bookedSeats).toBe(1);
    const indexes = await SeatAllocation.collection.listIndexes().toArray();
    expect(indexes.some(index => index.name === 'unique_flight_seat' && index.unique)).toBe(true);
  });

  it('allocates each passenger seat and blocks duplicate seats within one request', async () => {
    const result = await book({
      passengers: [
        passenger(),
        passenger({
          fullName: 'Luis Rivera',
          age: 30,
          gender: 'Male',
          passport: 'P100003',
          seatNumber: '7D'
        })
      ]
    });
    expect(result.statusCode).toBe(200);
    expect(await SeatAllocation.countDocuments({ flightId: flight._id })).toBe(2);
    expect((await Flight.findById(flight._id)).bookedSeats).toBe(2);

    const duplicate = await book({
      passengers: [
        passenger({ passport: 'P200001' }),
        passenger({ fullName: 'Luis Rivera', passport: 'P200002' })
      ]
    });
    expect(duplicate.statusCode).toBe(400);
  });

  it('recalculates price on edits and ignores submitted totals', async () => {
    const created = await book();
    expect(created.statusCode).toBe(200);
    const reservation = await Reservation.findOne({ userId });
    reservation.passengers[0].checkedIn = true;
    reservation.passengers[0].boardingPass = { outbound: 'BP-123456', return: null };
    await reservation.save();
    const response = await agent.post(`/reservations/${reservation._id}/edit`).send({
      passengersJSON: JSON.stringify([
        passenger({
          meal: 'Vegan',
          baggageAllowance: 2,
          seatNumber: '8A'
        })
      ]),
      totalPrice: 0
    });

    expect(response.statusCode).toBe(200);
    const updated = await Reservation.findById(reservation._id);
    expect(updated.price).toBe(1898);
    expect(updated.passengers[0].checkedIn).toBe(true);
    expect(updated.passengers[0].boardingPass.outbound).toBe('BP-123456');
    expect(await SeatAllocation.findOne({
      reservationId: reservation._id,
      seatNumber: '8A'
    })).not.toBeNull();
    expect(await SeatAllocation.findOne({
      reservationId: reservation._id,
      seatNumber: '7C'
    })).toBeNull();
    expect((await Flight.findById(flight._id)).bookedSeats).toBe(1);
  });

  it('cancels idempotently and releases claims and capacity once', async () => {
    const created = await book();
    const reservation = await Reservation.findOne({ userId });
    const first = await agent.post(`/reservations/cancel/${reservation._id}`);
    const second = await agent.post(`/reservations/cancel/${reservation._id}`);

    expect(created.statusCode).toBe(200);
    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(await SeatAllocation.countDocuments({ reservationId: reservation._id })).toBe(0);
    expect((await Flight.findById(flight._id)).bookedSeats).toBe(0);
    expect((await Reservation.findById(reservation._id)).status).toBe('Cancelled');
  });

  it('allocates return seats on the return flight and includes both fares', async () => {
    const returning = await createFlight({ price: 120, date: '2030-12-25' });
    await Flight.updateOne(
      { _id: returning._id },
      { $set: { origin: 'Hong Kong (HKG)', destination: 'Manila (MNL)' } }
    );
    const response = await book({
      returnFlight: String(returning._id),
      tripType: 'Round-Trip',
      passengers: [passenger({ returnSeatNumber: '8A' })]
    });
    expect(response.statusCode).toBe(200);
    const reservation = await Reservation.findOne({ userId });
    expect(reservation.price).toBe(3268);
    expect(await SeatAllocation.countDocuments({ reservationId: reservation._id })).toBe(2);
    expect((await Flight.findById(returning._id)).bookedSeats).toBe(1);
  });

  it('routes reservation update requests through server-side pricing', async () => {
    const created = await book();
    const reservation = await Reservation.findOne({ userId });
    const response = await agent.post(`/reservations/update/${reservation._id}`).send({
      passengers: [passenger({ meal: 'Vegan', seatNumber: '8A' })],
      totalPrice: 0
    });
    expect(created.statusCode).toBe(200);
    expect(response.statusCode).toBe(200);
    expect((await Reservation.findById(reservation._id)).price).toBe(1798);
  });
});
