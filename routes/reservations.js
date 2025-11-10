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
  try {
    const flightId = req.params.flightId;
    const flight = await Flight.findById(flightId).lean();
    if (!flight) return res.status(404).send('Flight not found');

    // Get details from query (passed from the flight card)
    const travelClass = req.query.travelClass || "Economy";
    const tripType = req.query.tripType || "One-Way";
    const departDate = req.query.depart || "";
    const returnDate = req.query.return || "";

    res.render('reservations/reservation', {
      title: 'Book Your Flight',
      flight,
      travelClass,
      tripType,
      departDate,
      returnDate
    });
  } catch (err) {
    console.error('Error loading booking page:', err);
    res.status(500).send('Error loading booking page.');
  }
});


//create

// ✅ Create Reservation Route
router.post("/create", isAuthenticated, async (req, res) => {
  try {
    const { flight, travelClass, passengers, totalAmount } = req.body;

    // passengers is already an array since we send JSON
    const parsedPassengers = Array.isArray(passengers)
      ? passengers
      : JSON.parse(passengers);

    const seatNumbers = parsedPassengers.map(p => p.seatNumber);

    const newReservation = new Reservation({
      userId: req.session.user?._id || null,
      flight,
      travelClass,
      passengers: parsedPassengers,
      seatNumbers,
      totalAmount: parseFloat(totalAmount) || 0,
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


// ✅ Confirmation Route 
router.get("/:id/confirmation", isAuthenticated,  async (req, res) => {
  try {
    const reservation = await Reservation.findById(req.params.id)
      .populate("flight")      // get flight details
      .populate("userId")      // optional, for user info
      .lean();                 // convert to plain object

    if (!reservation) return res.status(404).send("Reservation not found");

    res.render("reservations/confirmation", { 
      title: "Booking Confirmed",
      reservation 
    });
  } catch (err) {
    console.error("Error loading reservation:", err);
    res.status(500).send("Error loading reservation");
  }
});


// GET reservations/my-bookings - render my reservations page
router.get('/my-bookings', isAuthenticated, async (req, res) => {
  const userId = req.session.user.userId;
  try {
    const reservation = await Reservation.find({userId: userId})
      .populate("flight") 
      .lean(); 
      
    if (reservation.length === 0) {
      return;
    }

    res.render('reservations/myBookings', {
      title: 'My Bookings',
      reservation,
      user: req.session.user
    })
  }catch (err){
    console.error("Error loading reservation:", err);
    res.status(500).send("Error loading reservation");
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
