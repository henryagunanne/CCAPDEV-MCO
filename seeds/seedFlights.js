const Flight = require('../models/Flight');

async function seedFlights() {
  const count = await Flight.countDocuments();

  if (count === 0) {
    console.log('🌱 Seeding Flights collection...');

    await Flight.insertMany([
        {
            flightNumber: 'AA1001',
            origin: 'Manila (MNL)',
            destination: 'Hong Kong (HKG)',
            departureTime: new Date('2025-10-25T08:00:00'),
            arrivalTime: new Date('2025-10-25T10:30:00'),
            aircraft: 'Airbus A320',
            travelClass: 'Economy',
            seatCapacity: 180,
            price: 148,
            status: 'Scheduled'
        },
        {
            flightNumber: 'AA1002',
            origin: 'Manila (MNL)',
            destination: 'Singapore (SIN)',
            departureTime: new Date('2025-10-25T09:30:00'),
            arrivalTime: new Date('2025-10-25T12:30:00'),
            aircraft: 'Boeing 737 MAX',
            travelClass: 'Economy',
            seatCapacity: 170,
            price: 99,
            status: 'Scheduled'
        },
        {
            flightNumber: 'AA1003',
            origin: 'Manila (MNL)',
            destination: 'Bangkok (BKK)',
            departureTime: new Date('2025-10-31T07:15:00'),
            arrivalTime: new Date('2025-10-31T10:00:00'),
            aircraft: 'Airbus A320',
            travelClass: 'Economy',
            seatCapacity: 180,
            price: 188,
            status: 'On Time'
        },
        {
            flightNumber: 'AA1004',
            origin: 'Manila (MNL)',
            destination: 'Tokyo (HND)',
            departureTime: new Date('2025-10-30T08:00:00'),
            arrivalTime: new Date('2025-10-30T13:00:00'),
            aircraft: 'Boeing 787 Dreamliner',
            travelClass: 'Premium Economy',
            seatCapacity: 240,
            price: 200,
            status: 'Scheduled'
        },
        {
            flightNumber: 'AA1005',
            origin: 'Manila (MNL)',
            destination: 'Sydney (SYD)',
            departureTime: new Date('2025-11-09T23:00:00'),
            arrivalTime: new Date('2025-11-10T09:30:00'),
            aircraft: 'Airbus A350',
            travelClass: 'Business',
            seatCapacity: 300,
            price: 350,
            status: 'Scheduled'
        },
        {
            flightNumber: 'AA1006',
            origin: 'Manila (MNL)',
            destination: 'Seoul (ICN)',
            departureTime: new Date('2025-11-03T07:15:00'),
            arrivalTime: new Date('2025-11-03T11:00:00'),
            aircraft: 'Airbus A321',
            travelClass: 'Economy',
            seatCapacity: 200,
            price: 175,
            status: 'On Time'
        },
        {
            flightNumber: 'AA1007',
            origin: 'Manila (MNL)',
            destination: 'Ho Chi Minh City (SGN)',
            departureTime: new Date('2025-12-01T10:00:00'),
            arrivalTime: new Date('2025-12-01T13:00:00'),
            aircraft: 'Airbus A320',
            travelClass: 'Economy',
            seatCapacity: 190,
            price: 120,
            status: 'Scheduled'
        },
        {
            flightNumber: 'AA1008',
            origin: 'Manila (MNL)',
            destination: 'Taipei (TPE)',
            departureTime: new Date('2025-11-15T08:00:00'),
            arrivalTime: new Date('2025-11-15T10:30:00'),
            aircraft: 'Boeing 737 MAX',
            travelClass: 'Economy',
            seatCapacity: 180,
            price: 250,
            status: 'Scheduled'
        },
        {
            flightNumber: 'AA2001',
            origin: 'Manila (MNL)',
            destination: 'Tokyo (HND)',
            departureTime: new Date('2025-11-01T08:00:00'),
            arrivalTime: new Date('2025-11-01T13:00:00'),
            aircraft: 'Airbus A321',
            travelClass: 'Economy',
            seatCapacity: 180,
            price: 200,
            status: 'Scheduled'
        },
        {
            flightNumber: 'AA2002',
            origin: 'Tokyo (HND)',
            destination: 'Manila (MNL)',
            departureTime: new Date('2025-11-06T09:30:00'),
            arrivalTime: new Date('2025-11-06T14:15:00'),
            aircraft: 'Airbus A321',
            travelClass: 'Economy',
            seatCapacity: 180,
            price: 205,
            status: 'On Time'
        },
        {
            flightNumber: 'AA2003',
            origin: 'Manila (MNL)',
            destination: 'Singapore (SIN)',
            departureTime: new Date('2025-11-03T09:30:00'),
            arrivalTime: new Date('2025-11-03T12:45:00'),
            aircraft: 'Boeing 737 MAX',
            travelClass: 'Premium Economy',
            seatCapacity: 160,
            price: 180,
            status: 'On Time'
        },
        {
            flightNumber: 'AA2004',
            origin: 'Manila (MNL)',
            destination: 'Bangkok (BKK)',
            departureTime: new Date('2025-11-05T07:15:00'),
            arrivalTime: new Date('2025-11-05T10:45:00'),
            aircraft: 'Airbus A320',
            travelClass: 'Economy',
            seatCapacity: 170,
            price: 188,
            status: 'Scheduled'
        },
        {
            flightNumber: 'AA2005',
            origin: 'Manila (MNL)',
            destination: 'Hong Kong (HKG)',
            departureTime: new Date('2025-11-07T10:00:00'),
            arrivalTime: new Date('2025-11-07T12:30:00'),
            aircraft: 'Airbus A320',
            travelClass: 'Economy',
            seatCapacity: 150,
            price: 148,
            status: 'On Time'
        },
        {
            flightNumber: 'AA2006',
            origin: 'Manila (MNL)',
            destination: 'Sydney (SYD)',
            departureTime: new Date('2025-11-09T23:00:00'),
            arrivalTime: new Date('2025-11-10T09:30:00'),
            aircraft: 'Airbus A350',
            travelClass: 'Business',
            seatCapacity: 280,
            price: 350,
            status: 'Scheduled'
        },
        {
            flightNumber: 'AA2007',
            origin: 'Manila (MNL)',
            destination: 'Seoul (ICN)',
            departureTime: new Date('2025-11-12T07:15:00'),
            arrivalTime: new Date('2025-11-12T11:00:00'),
            aircraft: 'Boeing 787 Dreamliner',
            travelClass: 'Economy',
            seatCapacity: 220,
            price: 175,
            status: 'Scheduled'
        },
        {
            flightNumber: 'AA2008',
            origin: 'Manila (MNL)',
            destination: 'Ho Chi Minh City (SGN)',
            departureTime: new Date('2025-11-15T10:00:00'),
            arrivalTime: new Date('2025-11-15T13:30:00'),
            aircraft: 'Airbus A321',
            travelClass: 'Economy',
            seatCapacity: 190,
            price: 120,
            status: 'Scheduled'
        },
        {
            flightNumber: 'AA2009',
            origin: 'Manila (MNL)',
            destination: 'Taipei (TPE)',
            departureTime: new Date('2025-11-17T08:00:00'),
            arrivalTime: new Date('2025-11-17T10:00:00'),
            aircraft: 'Airbus A320',
            travelClass: 'Economy',
            seatCapacity: 160,
            price: 250,
            status: 'On Time'
        },
        {
            flightNumber: 'AA2010',
            origin: 'Manila (MNL)',
            destination: 'Dubai (DXB)',
            departureTime: new Date('2025-11-20T21:00:00'),
            arrivalTime: new Date('2025-11-21T04:30:00'),
            aircraft: 'Boeing 777',
            travelClass: 'First',
            seatCapacity: 300,
            price: 950,
            status: 'Scheduled'
        },
        {
            flightNumber: 'AA2011',
            origin: 'Manila (MNL)',
            destination: 'Cebu (CEB)',
            departureTime: new Date('2025-11-22T08:00:00'),
            arrivalTime: new Date('2025-11-22T09:30:00'),
            aircraft: 'Airbus A320',
            travelClass: 'Economy',
            seatCapacity: 180,
            price: 120,
            status: 'On Time'
        },
        {
            flightNumber: 'AA2012',
            origin: 'Cebu (CEB)',
            destination: 'Manila (MNL)',
            departureTime: new Date('2025-11-22T10:30:00'),
            arrivalTime: new Date('2025-11-22T12:00:00'),
            aircraft: 'Airbus A320',
            travelClass: 'Economy',
            seatCapacity: 180,
            price: 125,
            status: 'On Time'
        },
        {
            flightNumber: 'AA2013',
            origin: 'Manila (MNL)',
            destination: 'Los Angeles (LAX)',
            departureTime: new Date('2025-11-25T22:30:00'),
            arrivalTime: new Date('2025-11-26T15:00:00'),
            aircraft: 'Boeing 777',
            travelClass: 'Business',
            seatCapacity: 320,
            price: 980,
            status: 'Scheduled'
        },
        {
            flightNumber: 'AA2014',
            origin: 'Manila (MNL)',
            destination: 'London (LHR)',
            departureTime: new Date('2025-11-27T23:30:00'),
            arrivalTime: new Date('2025-11-28T13:30:00'),
            aircraft: 'Airbus A350',
            travelClass: 'First',
            seatCapacity: 300,
            price: 1100,
            status: 'Scheduled'
        },
        {
            flightNumber: 'AA2015',
            origin: 'Manila (MNL)',
            destination: 'Kuala Lumpur (KUL)',
            departureTime: new Date('2025-11-30T06:30:00'),
            arrivalTime: new Date('2025-11-30T09:00:00'),
            aircraft: 'Boeing 737',
            travelClass: 'Economy',
            seatCapacity: 180,
            price: 150,
            status: 'On Time'
        }
    ]);

    console.log('✅ Flights successfully seeded!');
  } else {
    console.log('🛫 Flights already exist — skipping seeding.');
  }
}

module.exports = seedFlights;
