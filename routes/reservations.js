// routes/reservations.js
const express = require('express');
const router = express.Router();
const Reservation = require('../models/Reservation');
const Flight = require('../models/Flight');
const User = require('../models/User');

/* =============================
   AUTHENTICATION CHECK
============================= */
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
   BOOK PAGE - Flight Selection (navbar "Book" link)
============================= */
router.get('/book-select', async (req, res) => {
  try {
    console.log("🧭 /reservations/book-select accessed");

    // Fetch all flights
    const flights = await Flight.find().lean();

    if (!flights || flights.length === 0) {
      console.log("⚠️ No flights found in database");
    }

    // Render book-select.hbs
    res.render('reservations/book-select', {
      title: 'Book a Flight',
      flights,
      user: req.session.user
    });
  } catch (err) {
    console.error('❌ Error loading book page:', err);
    res.status(500).send('Error loading book page.');
  }
});

/* =============================
   BOOK PAGE - Show Booking Form (after selecting flight)
============================= */
router.get('/book/:flightId', isAuthenticated, async (req, res) => {
  try {
    const flightId = req.params.flightId;
    const flight = await Flight.findById(flightId).lean();

    if (!flight) return res.status(404).send('Flight not found');

    const travelClass = req.query.travelClass || 'Economy';
    const tripType   = req.query.tripType   || 'One-Way';
    const departDate = req.query.depart     || '';
    const returnDate = req.query.return     || '';

    // Load possible return flights (same route, opposite direction)
    const returnFlights = await Flight.find({
      origin: flight.destination,
      destination: flight.origin
    }).lean();

    res.render('reservations/reservation', {
      title: 'Book Your Flight',
      flight,
      travelClass,
      tripType,
      departDate,
      returnDate,
      returnFlights,
      user: req.session.user
    });
  } catch (err) {
    console.error('Error loading booking page:', err);
    res.status(500).send('Error loading booking page.');
  }
});

/* =============================
   CREATE RESERVATION
============================= */
router.post("/create", isAuthenticated, async (req, res) => {
  try {
    const { flight, returnFlight, travelClass, tripType, passengers, totalAmount } = req.body;
    const parsedPassengers = Array.isArray(passengers)
      ? passengers
      : JSON.parse(passengers);

    const newReservation = new Reservation({
      userId: req.session.user?._id || null,
      flight: returnFlight ? [flight, returnFlight] : [flight],
      travelClass,
      tripType,
      passengers: parsedPassengers,
      price: parseFloat(totalAmount) || 0,
      status: "Pending"
    });

    await newReservation.save();
    console.log("✅ New reservation created:", newReservation);

    res.json({ redirect: `/reservations/${newReservation._id}/confirmation` });
  } catch (err) {
    console.error("❌ Error creating reservation:", err);
    res.status(500).send("Error creating reservation");
  }
});

/* =============================
   CONFIRMATION PAGE
============================= */
router.get("/:id/confirmation", isAuthenticated, async (req, res) => {
  try {
    const reservation = await Reservation.findById(req.params.id)
      .populate("flight")
      .populate("userId")
      .lean();

    if (!reservation) return res.status(404).send("Reservation not found");

    res.render("reservations/confirmation", { 
      title: "Booking Confirmed",
      reservation,
      user: req.session.user
    });
  } catch (err) {
    console.error("Error loading reservation:", err);
    res.status(500).send("Error loading reservation");
  }
});

/* =============================
   MY BOOKINGS PAGE
============================= */
router.get('/my-bookings', isAuthenticated, async (req, res) => {
  try {
    const userId = req.session.user._id;
    const reservations = await Reservation.find({ userId })
      .populate("flight")
      .lean(); 

    res.render('reservations/myBookings', {
      title: 'My Bookings',
      reservations,
      user: req.session.user
    });
  } catch (err) {
    console.error("Error loading reservations:", err);
    res.status(500).send("Error loading reservations");
  }
});

/* =============================
   CANCEL RESERVATION
============================= */
router.post('/cancel/:reservationId', isAuthenticated, async (req, res) => {
  try {
    const { reservationId } = req.params;

    const cancelledReservation = await Reservation.findByIdAndUpdate(
      reservationId,
      { status: 'Cancelled' },
      { new: true }
    );

    if (!cancelledReservation) {
      return res.status(404).send('Reservation not found');
    }

    res.json({ 
      success: true, 
      message: 'Reservation Cancelled',
      cancelledReservation
    });
  } catch (err) {
    console.error('❌ Reservation update error:', err);
    res.status(500).send('Server error during Reservation update');
  }
});

/* =============================
   EDIT RESERVATION
============================= */
router.get('/edit/:id', isAuthenticated, async (req, res) => {
  try {
    const reservation = await Reservation.findById(req.params.id)
      .populate('flight')
      .lean();

    if (!reservation) return res.status(404).send('Reservation not found');

    res.render('reservations/edit-reservation', {
      title: 'Edit Reservation',
      reservation,
      passengers: reservation.passengers.length > 0,
      user: req.session.user
    });
  } catch (err) {
    console.error('Error loading booking page:', err);
    res.status(500).send('Error loading booking page.');
  }
});

/* =============================
   VIEW SINGLE RESERVATION
============================= */
router.get('/:id', isAuthenticated, async (req, res) => {
  try {
    const reservation = await Reservation.findById(req.params.id)
      .populate('flight')
      .lean();

    if (!reservation) return res.status(404).send('Reservation not found');
    res.render('reservations/details', { title: 'Booking Details', reservation, user: req.session.user });
  } catch (err) {
    console.error("Error loading reservation:", err);
    res.status(500).send('Error loading reservation');
  }
});

/* =============================
   DELETE RESERVATION (ADMIN ONLY)
============================= */
router.post('/delete/:id', isAuthenticated, async (req, res) => {
  try {
    await Reservation.findByIdAndDelete(req.params.id);
    console.log('❌ Reservation deleted');
    res.redirect('/reservations/my-bookings');
  } catch (err) {
    res.status(500).send('Error deleting reservation');
  }
});

module.exports = router;
