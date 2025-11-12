// routes/reservations.js
const express = require('express');
const router = express.Router();
const Reservation = require('../models/Reservation');
const Flight = require('../models/Flight');
const User = require('../models/User');

/* =============================
   AUTH CHECK
============================= */
function isAuthenticated(req, res, next) {
  if (req.session.user) return next();
  res.status(403).render('error/access-denied', { 
    title: 'Access Denied',
    isAdmin: req.session.user?.role === 'Admin'
  });  
}

/* =============================
   BOOK PAGE (Dropdown Select)
============================= */
router.get('/book-select', isAuthenticated, async (req, res) => {
  try {
    console.log("🧭 /reservations/book-select accessed");

    const flights = await Flight.find().lean();
    const origins = [...new Set(flights.map(f => f.origin))];
    const destinations = [...new Set(flights.map(f => f.destination))];

    res.render('reservations/book-select', {
      title: 'Book a Flight',
      origins,
      destinations,
      user: req.session.user
    });
  } catch (err) {
    console.error('❌ Error loading book-select page:', err);
    res.status(500).send('Error loading booking page.');
  }
});

/* =============================
   FLIGHT SEARCH API (used by AJAX)
============================= */
router.get('/search', isAuthenticated, async (req, res) => {
  try {
    const { origin, destination } = req.query;
    if (!origin || !destination) {
      return res.status(400).json({ flights: [] });
    }

    const flights = await Flight.find({ origin, destination }).lean();
    console.log(`✈️ Found ${flights.length} flights from ${origin} to ${destination}`);
    res.json({ flights });
  } catch (err) {
    console.error('❌ Error searching flights:', err);
    res.status(500).json({ flights: [] });
  }
});

/* =============================
   BOOK PAGE - After selecting a flight
============================= */
router.get('/book/:flightId', isAuthenticated, async (req, res) => {
  try {
    const flight = await Flight.findById(req.params.flightId).lean();
    if (!flight) return res.status(404).send('Flight not found');

    const travelClass = req.query.travelClass || 'Economy';
    const tripType = req.query.tripType || 'One-Way';
    const departDate = req.query.depart || '';
    const returnDate = req.query.return || '';

    const allReturnFlights = await Flight.find({
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
      returnFlights: allReturnFlights,
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
    console.log("✅ New reservation created:", newReservation._id);
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
    const reservationDoc = await Reservation.findById(req.params.id)
      .populate("flight")
      .populate("userId");
    if (!reservationDoc) return res.status(404).send("Reservation not found");

    const reservation = reservationDoc.toObject();
    reservation.mealTotal = reservation.passengers.reduce(
      (sum, p) => sum + (p.meal && p.meal !== "None" ? 150 : 0), 0
    );
    reservation.baggageTotal = reservation.passengers.reduce(
      (sum, p) => sum + ((p.baggageAllowance || 0) * 50), 0
    );

    res.render("reservations/confirmation", { 
      title: "Booking Confirmed",
      reservation,
      user: req.session.user
    });
  } catch (err) {
    console.error("❌ Error loading confirmation:", err);
    res.status(500).send("Error loading reservation confirmation");
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
    console.error("❌ Error loading my bookings:", err);
    res.status(500).send("Error loading reservations");
  }
});

/* =============================
   CANCEL RESERVATION
============================= */
router.post('/cancel/:reservationId', isAuthenticated, async (req, res) => {
  try {
    const { reservationId } = req.params;
    const cancelled = await Reservation.findByIdAndUpdate(
      reservationId,
      { status: 'Cancelled' },
      { new: true }
    );
    if (!cancelled) return res.status(404).send('Reservation not found');
    res.json({ success: true, message: 'Reservation Cancelled', cancelled });
  } catch (err) {
    console.error('❌ Reservation cancel error:', err);
    res.status(500).send('Server error cancelling reservation');
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
    console.error("❌ Error loading reservation:", err);
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
