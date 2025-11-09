// routes/admin.js
const express = require('express');
const router = express.Router();
const Flight = require('../models/Flight');
const User = require('../models/User');
const Reservation = require('../models/Reservation');

/* ===========================
   🔒 Admin Access Middleware
=========================== */
router.use((req, res, next) => {
  if (req.session.user && req.session.user.role === 'Admin') {
    return next();
  }
  res.status(403).render('error/access-denied', { 
    title: 'Access Denied',
    isAdmin: req.session.user?.role === 'Admin'
  });  
});

/* ===========================
   🏠 Admin Dashboard
=========================== */
router.get('/', async (req, res) => {
    const flights = await Flight.find().lean();
    const users = await User.find().lean(); 
    const reservations = await Reservation.find().lean();
  res.render('admin/dashboard', {
    layout: 'admin',
    title: 'Admin Dashboard',
    admin: req.session.user,
    stats: {
      totalFlights: flights.length,
      totalUsers: users.length,
      totalReservations: reservations.length
    }
  });
});

/* ===========================
   ✈️ GET All Flights
=========================== */
router.get('/flights', async (req, res) => {
  try {
    const flights = await Flight.find().lean();

    // JSON (for AJAX/API) vs Template Rendering
    if (req.xhr || req.headers.accept.indexOf('json') > -1) {
      return res.status(200).json(flights);
    }

    res.render('admin/list', {
      layout: 'admin',
      title: 'All Flights',
      flights
    });
  } catch (error) {
    console.error('❌ Error retrieving flights:', error);
    res.status(500).json({ message: 'Error retrieving flights', error });
  }
});

/* ===========================
   🔍 GET Flight by Flight Number
=========================== */
router.get('/flights/:flightNumber', async (req, res) => {
  const flightNumber = req.params.flightNumber;
  try {
    const flight = await Flight.findOne({flightNumber: flightNumber}).lean();
    if (!flight) return res.status(404).json({ message: 'Flight not found.' });

    res.json({
      success: true,
      flightNumber: flight.flightNumber,
      origin: flight.origin,
      destination: flight.destination,
      date: flight.departureDate,
      price: flight.price,
      message: 'Flight retrieved successfully.'
    });
  } catch (error) {
    console.error('❌ Error retrieving flight:', error);
    res.status(500).json({ message: 'Error retrieving flight' });
  }
});

// GET /admin/create - Render create flight form
router.get('/create', (req, res) => {
  res.render('admin/create', {
    layout: 'admin',
    title: 'Create New Flight'
  });
});

/* ===========================
   ➕ CREATE New Flight
=========================== */
router.post('/create', async (req, res) => {
  try {
    const {
      flightNumber,
      origin,
      destination,
      departureDate,
      departureTime,
      arrivalTime,
      aircraft,
      seatCapacity,
      price,
      status
    } = req.body;

    // Basic validation
    if (
      !flightNumber ||
      !origin ||
      !destination ||
      !departureDate ||
      !departureTime ||
      !arrivalTime ||
      !aircraft ||
      !seatCapacity ||
      !price
    ) {
      return res.status(400).json({ message: 'All required fields must be filled.' });
    }

    const existing = await Flight.findOne({ flightNumber });
    if (existing) {
      return res.status(400).json({ message: 'Flight number already exists.' });
    }

    const newFlight = new Flight({
      flightNumber,
      origin,
      destination,
      departureDate,
      departureTime,
      arrivalTime,
      aircraft,
      seatCapacity,
      price,
      status: status || 'Scheduled'
    });

    const savedFlight = await newFlight.save();
    res.status(201).json({
      message: 'Flight created successfully.',
      flight: savedFlight
    });
  } catch (error) {
    console.error('❌ Error creating flight:', error);
    res.status(500).json({ message: 'Error creating flight.', error });
  }
});

/* ===========================
   ✏️ UPDATE Existing Flight
=========================== */
router.put('/update/:id', async (req, res) => {
  try {
    const updatedFlight = await Flight.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    ).lean();

    if (!updatedFlight) {
      return res.status(404).json({ message: 'Flight not found.' });
    }

    res.status(200).json({
      message: 'Flight updated successfully.',
      flight: updatedFlight
    });
  } catch (error) {
    console.error('❌ Error updating flight:', error);
    res.status(500).json({ message: 'Error updating flight.', error });
  }
});

/* ===========================
   🗑️ DELETE Flight
=========================== */
router.delete('/delete/:id', async (req, res) => {
  try {
    const deletedFlight = await Flight.findByIdAndDelete(req.params.id).lean();
    if (!deletedFlight) {
      return res.status(404).json({ message: 'Flight not found.' });
    }
    res.status(200).json({ message: 'Flight deleted successfully.' });
  } catch (error) {
    console.error('❌ Error deleting flight:', error);
    res.status(500).json({ message: 'Error deleting flight.', error });
  }
});


// GET /admin/reservations - View all reservations
router.get('/reservations', async (req, res) => {
  try {
    const reservations = await Reservation.find()
    .populate('flight')
    .populate('userId')
    .lean();

    res.render('admin/bookings', {
      layout: 'admin',
      title: 'All Reservations',
      reservations
    });
  } catch (error) {
    console.error('❌ Error retrieving reservations:', error);
    res.status(500).json({ message: 'Error retrieving reservations', error });
  }
});

// POST /admin/edit-reservation/:id 
router.post('/edit-reservation/:reservationId', async (req, res) => {
  const { status } = req.body;
  const { reservationId } = req.params;
  try{
    const updatedReservation = await Reservation.findByIdAndUpdate(
      reservationId,
      { status },
      { new: true }
    ).lean();


    if (!updatedReservation) {
      return res.status(404).send('Reservation not found');
    }

    res.json({ 
      success: true, 
      message: 'Reservation updated successfully!',
      updatedReservation
    });
  }catch (err) {
    console.error('❌ Reservation update error:', err);
    res.status(500).send('Server error during Reservation update');
  }
});

// POST /admin/delete-reservation/:reservationId
router.post('/delete-reservation/:reservationId', async (req, res) => {
  const { reservationId } = req.params;
  try {
    const deletedReservation = await Reservation.findByIdAndDelete(reservationId);
  
    if (!deletedReservation) {
      return res.status(404).send('Reservation not found');
    }

    res.json({ success: true });
  } catch (error) {
    console.error('❌ Reservation deletion error:', error);
    res.status(500).send('Server error during Reservation deletion');
  }
});

// Export the router
module.exports = router;
