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
   🔍 GET Flight by ID
=========================== */
router.get('/flights/:id', async (req, res) => {
  try {
    const flight = await Flight.findById(req.params.id).lean();
    if (!flight) return res.status(404).json({ message: 'Flight not found.' });

    if (req.xhr || req.headers.accept.indexOf('json') > -1) {
      return res.status(200).json(flight);
    }

    res.render('flights/detail', {
      layout: 'admin',
      title: 'Flight Details',
      flight
    });
  } catch (error) {
    console.error('❌ Error retrieving flight:', error);
    res.status(500).json({ message: 'Error retrieving flight', error });
  }
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

module.exports = router;
