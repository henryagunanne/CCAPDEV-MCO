// routes/reservations.js
const express = require('express');
const Reservation = require('../models/Reservation');
const Flight = require('../models/Flight');
const User = require('../models/User');
const router = express.Router();

// Helper middleware to check if user is authenticated
function isAuthenticated(req, res, next) {
  if (req.session.user) {
    return next();
  }
  res.status(401).send('Unauthorized: Please log in to access this resource');  
}

/* =============================
   BOOK PAGE - Show booking form
============================= */
router.get('/book/:flightId', isAuthenticated, async (req, res) => {
  const flightId = req.params.flightId;

  try {
    const flight = await Flight.findById(flightId).lean();

    if (!flight) {
      return res.status(404).send('Flight not found');
    }

    res.render('reservations/reservation', {
      title: 'Book Your Flight',
      flight
    });
  } catch (err) {
    console.error('Error loading booking page:', err);
    res.status(500).send('Error loading booking page.');
  }
});

/* =============================
   CREATE - Make a new booking
============================= */
router.post('/create', isAuthenticated, async (req, res) => {
  try {
    const {
      fullName,
      email,
      passport,
      flight,
      seatNumber,
      tripType,
      travelClass,
      meal,
      baggageAllowance
    } = req.body;

    console.log("🧾 Form data received:", req.body);


    // Validate required fields
    if (!fullName || !email || !passport || !seatNumber || !flight) {
      console.error('❌ Missing required fields from form');
      return res.status(400).send('Missing required fields.');
    }

    // Create reservation document
    const newReservation = new Reservation({
      userId: req.session?.user?._id || null, // optional guest
      fullName,
      email,
      passport,
      flight,
      seatNumber,
      tripType: tripType || 'One-Way',
      travelClass: travelClass || 'Economy',
      meal: meal || 'None',
      baggageAllowance: baggageAllowance ? parseInt(baggageAllowance) : 0,
      status: 'Confirmed'
    });

    await newReservation.save();
    console.log(`✅ Reservation created for ${fullName} (${seatNumber})`);

    // Fetch the saved reservation again, now with full flight details
    const populatedReservation = await Reservation.findById(newReservation._id)
      .populate('flight')
      .lean();

    res.render('reservations/reservationSuccess', {
      title: 'Booking Confirmed',
      reservation: populatedReservation
    });



  } catch (err) {
    console.error('Error creating reservation:', err);
    res.status(500).send('Error creating reservation');
  }
});

/* =============================
   READ - Show all reservations
============================= */
router.get('/myBookings', isAuthenticated, async (req, res) => {
  try {
    const reservations = await Reservation.find()
      .populate('flight')
      .lean();
    res.render('reservations/myBookings', { title: 'My Bookings', reservations });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error loading bookings');
  }
});

/* =============================
   READ - View single reservation
============================= */
router.get('/:id', isAuthenticated, async (req, res) => {
  try {
    const reservation = await Reservation.findById(req.params.id).populate('flight').lean();
    if (!reservation) return res.status(404).send('Reservation not found');
    res.render('reservations/details', { title: 'Booking Details', reservation });
  } catch (err) {
    res.status(500).send('Error loading reservation');
  }
});

/* =============================
   DELETE - Cancel reservation
============================= */
router.post('/delete/:id', isAuthenticated, async (req, res) => {
  try {
    await Reservation.findByIdAndDelete(req.params.id);
    console.log('❌ Reservation cancelled');
    res.redirect('/reservations/myBookings');
  } catch (err) {
    res.status(500).send('Error deleting reservation');
  }
});

module.exports = router;
