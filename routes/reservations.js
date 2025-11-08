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
  res.status(403).render('error/access-denied', { 
    title: 'Access Denied',
    isAdmin: req.session.user?.role === 'Admin'
  });  
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

router.post('/create', isAuthenticated, async (req, res) => {
  try {
    const { flight, tripType, travelClass, passengers } = req.body;

    if (!passengers || !Array.isArray(passengers) || passengers.length === 0) {
      return res.status(400).send('Missing passenger information.');
    }

    // Get logged in user
    const userId = req.session?.user?._id || null;

    // Save one reservation per passenger
    const createdReservations = [];
    for (const p of passengers) {
      const newReservation = new Reservation({
        userId,
        flight,
        tripType: tripType || 'One-Way',
        travelClass: travelClass || 'Economy',
        fullName: p.fullName,
        email: p.email,
        passport: p.passport,
        seatNumber: p.seatNumber,
        meal: p.meal,
        baggageAllowance: p.baggageAllowance || 0,
        status: 'Confirmed',
      });

      await newReservation.save();
      createdReservations.push(newReservation);
    }

    console.log(`✅ Created ${createdReservations.length} individual reservations.`);

    res.render('reservations/reservationSuccess', {
      title: 'Booking Confirmed',
      reservations: createdReservations.map(r => r.toObject()),
    });

  } catch (err) {
    console.error('Error creating reservation:', err);
    res.status(500).send('Error creating reservation');
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
