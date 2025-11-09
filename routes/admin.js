// routes/admin.js
const express = require('express');
const router = express.Router();
const Flight = require('../models/Flight');
const User = require('../models/User');
const Reservation = require('../models/Reservation');

/* ======================================================
 ✅ Admin Access Middleware
====================================================== */
router.use((req, res, next) => {
  if (req.session.user && req.session.user.role === 'Admin') {
    return next();
  }
  return res.status(403).render('error/access-denied', {
    title: "Access Denied"
  });
});

/* ======================================================
 ✅ DEBUG LOGGER (optional)
====================================================== */
router.use((req, res, next) => {
  console.log("🔥 ADMIN ROUTE:", req.method, req.originalUrl);
  next();
});

/* ======================================================
 ✅ Dashboard Route (ALWAYS FIRST)
====================================================== */
router.get('/', async (req, res) => {
  try {
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
  } catch (err) {
    console.error(err);
    res.status(500).render('error/server-error');
  }
});

/* ======================================================
 ✅ Edit Flight Page (MUST COME BEFORE /flights/:param)
====================================================== */
router.get('/edit/:id', async (req, res) => {
  try {
    const flight = await Flight.findById(req.params.id).lean();

    if (!flight) {
      return res.status(404).render('error/404', {
        layout: 'admin',
        title: 'Flight Not Found'
      });
    }

    res.render('admin/edit', {
      layout: 'admin',
      title: 'Edit Flight',
      flight
    });

  } catch (err) {
    console.error("❌ edit route error:", err);
    res.status(500).render('error/server-error');
  }
});

/* ======================================================
 ✅ Create Flight Page
====================================================== */
router.get('/create', (req, res) => {
  res.render('admin/create', {
    layout: 'admin',
    title: 'Create New Flight'
  });
});

/* ======================================================
 ✅ Get All Flights
====================================================== */
router.get('/flights', async (req, res) => {
  try {
    const flights = await Flight.find().lean();

    // JSON response for AJAX
    if (req.xhr || req.headers.accept.includes('json')) {
      return res.status(200).json(flights);
    }

    res.render('admin/list', {
      layout: 'admin',
      title: 'All Flights',
      flights
    });

  } catch (error) {
    console.error('❌ Error retrieving flights:', error);
    res.status(500).json({ message: 'Error retrieving flights' });
  }
});

/* ======================================================
 ✅ Flight Search by FlightNumber (Place AFTER /edit/:id)
====================================================== */
router.get('/flights/:flightNumber', async (req, res) => {
  try {
    const flight = await Flight.findOne({ flightNumber: req.params.flightNumber }).lean();

    if (!flight) return res.status(404).json({ message: 'Flight not found.' });

    res.json({
      success: true,
      flightNumber: flight.flightNumber,
      origin: flight.origin,
      destination: flight.destination,
      date: flight.departureDate,
      price: flight.price
    });

  } catch (err) {
    console.error('❌ search error:', err);
    res.status(500).json({ message: 'Error retrieving flight' });
  }
});

/* ======================================================
 ✅ Create Flight API
====================================================== */
router.post('/create', async (req, res) => {
  try {
    let flight = new Flight(req.body);
    const saved = await flight.save();

    res.status(201).json({
      message: 'Flight created successfully.',
      flight: saved
    });

  } catch (err) {
    console.error('❌ create flight error:', err);
    res.status(500).json({ message: 'Error creating flight.' });
  }
});

/* ======================================================
 ✅ Update Flight
====================================================== */
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

    res.json({ message: 'Flight updated successfully.', flight: updatedFlight });

  } catch (err) {
    console.error('❌ update flight error:', err);
    res.status(500).json({ message: 'Error updating flight.' });
  }
});

/* ======================================================
 ✅ Delete Flight
====================================================== */
router.delete('/delete/:id', async (req, res) => {
  try {
    const deletedFlight = await Flight.findByIdAndDelete(req.params.id).lean();

    if (!deletedFlight) {
      return res.status(404).json({ message: 'Flight not found.' });
    }

    res.json({ message: 'Flight deleted successfully.' });

  } catch (err) {
    console.error('❌ delete flight error:', err);
    res.status(500).json({ message: 'Error deleting flight.' });
  }
});

/* ======================================================
 ✅ Reservations
====================================================== */
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

  } catch (err) {
    console.error('❌ Reservations error:', err);
    res.status(500).json({ message: 'Error retrieving reservations.' });
  }
});

module.exports = router;
