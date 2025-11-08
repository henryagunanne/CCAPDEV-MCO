// routes/admin.js
const express = require('express');
const router = express.Router();
const Flight = require('../models/Flight');

/* ===========================
ADMIN ROUTES FOR FLIGHTS
=========================== */

// ===========================
// Middleware: Admin Auth
// ===========================
router.use((req, res, next) => {
  if (req.session.user && req.session.user.role === 'Admin') {
    next();
  } else {
    // For local testing (temporary)
    req.session.user = { role: 'Admin', firstName: 'Admin', lastName: 'User' };
    next();
    // Uncomment below in production:
    // return res.status(403).json({ message: 'Access denied. Admins only.' });
  }
});

// ===========================
// Dashboard Route
// ===========================
router.get('/', (req, res) => {
  res.render('admin/dashboard', {
    layout: 'admin',
    title: 'Admin Dashboard',
    admin: req.session.user
  });
});

// ===========================
// Retrieve All Flights
// ===========================
router.get('/flights', async (req, res) => {
  try {
    const flights = await Flight.find().lean();
    res.render('flights/list', {
      layout: 'admin',
      title: 'All Flights',
      flights
    });
  } catch (error) {
    console.error('Error retrieving flights:', error);
    res.status(500).json({ message: 'Error retrieving flights', error });
  }
});

// ===========================
// Retrieve Flight by Flight Number
// ===========================
router.get('/flights/:flightNumber', async (req, res) => {
  try {
    const flight = await Flight.findOne({ flightNumber: req.params.flightNumber }).lean();
    if (!flight) return res.status(404).json({ message: 'Flight not found.' });

    // If AJAX, send JSON; otherwise render a detail page
    if (req.xhr || req.headers.accept.indexOf('json') > -1) {
      return res.status(200).json(flight);
    }

    res.render('flights/detail', { layout: 'admin', title: 'Flight Details', flight });
  } catch (error) {
    console.error('Error retrieving flight:', error);
    res.status(500).json({ message: 'Error retrieving flight', error });
  }
});

// ===========================
// Create Flight Form (GET)
// ===========================
router.get('/create', (req, res) => {
  res.render('flights/create', {
    layout: 'admin',
    title: 'Create Flight',
    admin: req.session.user
  });
});

// ===========================
// Create New Flight (POST)
// ===========================
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
    if (!flightNumber || !origin || !destination || !departureDate ||
        !departureTime || !arrivalTime || !aircraft || !seatCapacity || !price) {
      return res.status(400).json({ message: 'All required fields must be filled.' });
    }

    const exists = await Flight.findOne({ flightNumber });
    if (exists) return res.status(400).json({ message: 'Flight number already exists.' });

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

    const saved = await newFlight.save();
    res.status(201).json({ message: 'Flight created successfully.', flight: saved });
  } catch (error) {
    console.error('Error creating flight:', error);
    res.status(500).json({ message: 'Error creating flight.', error });
  }
});

// ===========================
// Update Existing Flight
// ===========================
router.put('/update/:id', async (req, res) => {
  try {
    const updatedFlight = await Flight.findByIdAndUpdate(req.params.id, req.body, { new: true }).lean();
    if (!updatedFlight) return res.status(404).json({ message: 'Flight not found.' });
    res.status(200).json({ message: 'Flight updated successfully.', flight: updatedFlight });
  } catch (error) {
    console.error('Error updating flight:', error);
    res.status(500).json({ message: 'Error updating flight.', error });
  }
});

// ===========================
// Delete Flight
// ===========================
router.delete('/delete/:id', async (req, res) => {
  try {
    const deletedFlight = await Flight.findByIdAndDelete(req.params.id).lean();
    if (!deletedFlight) return res.status(404).json({ message: 'Flight not found.' });
    res.status(200).json({ message: 'Flight deleted successfully.' });
  } catch (error) {
    console.error('Error deleting flight:', error);
    res.status(500).json({ message: 'Error deleting flight.', error });
  }
});

module.exports = router;
