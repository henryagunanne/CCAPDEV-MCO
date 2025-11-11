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

    // values coming from search / card (if any)
    const travelClass = req.query.travelClass || 'Economy';
    const tripType   = req.query.tripType   || 'One-Way';
    const departDate = req.query.depart     || '';
    const returnDate = req.query.return     || '';

    // 🔁 ALWAYS load possible return flights (same route, opposite direction)
    const returnFlights = await Flight.find({
      origin:      flight.destination,
      destination: flight.origin
    }).lean();

    res.render('reservations/reservation', {
      title: 'Book Your Flight',
      flight,
      travelClass,
      tripType,
      departDate,
      returnDate,
      returnFlights            // 🔥 pass to template
    });
  } catch (err) {
    console.error('Error loading booking page:', err);
    res.status(500).send('Error loading booking page.');
  }
});




/* =============================
   CREATE
============================= */

//  Create Reservation Route
router.post("/create", isAuthenticated, async (req, res) => {
  try {
    const { flight, returnFlight, travelClass, tripType, passengers, totalAmount } = req.body;

    const parsedPassengers = Array.isArray(passengers)
      ? passengers
      : JSON.parse(passengers);

    const seatNumbers = parsedPassengers.map(p => p.seatNumber);

console.log("📦 Incoming reservation body:", req.body);


    // ✅ Create new reservation with correct field names
    const newReservation = new Reservation({
      userId: req.session.user?._id || null,
      flight: returnFlight ? [flight, returnFlight] : [flight], // ✅ field name matches schema
      travelClass,
      tripType,
      passengers: parsedPassengers,
      Price: parseFloat(totalAmount) || 0, // ✅ required Price field
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
      .populate("flights")     // get flight details
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
  const userId = req.session.user._id;

  try {
    const reservation = await Reservation.find({userId})
      .populate("flights")
      .lean(); 

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


// POST /reservations/cancel/:reservationId - Cancel a reservation
router.post('/cancel/:reservationId', isAuthenticated, async (req, res) => {
  const { reservationId } = req.params;

  try{
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
  }catch (err) {
    console.error('❌ Reservation update error:', err);
    res.status(500).send('Server error during Reservation update');
  }
});

// GET /reservation/edit/:id 
router.get('/edit/:id', isAuthenticated, async (req, res) => {
  try {
    const id = req.params.id;
    const reservation = await Reservation.findById(id)
    .populate('flights')
    .lean();

    if (!reservation) return res.status(404).send('Flight not found');

    res.render('reservations/edit-reservation', {
      title: 'Edit Reservation',
      reservation,
      passengers: reservation.passengers.length > 0
    });
  } catch (err) {
    console.error('Error loading booking page:', err);
    res.status(500).send('Error loading booking page.');
  }
});


/* =============================
   READ - View single reservation
============================= */
router.get('/:id', isAuthenticated, async (req, res) => {
  try {
    const reservation = await Reservation.findById(req.params.id)
      .populate('flights')  // ✅ plural
      .lean();

    if (!reservation) return res.status(404).send('Reservation not found');
    res.render('reservations/details', { title: 'Booking Details', reservation });
  } catch (err) {
    console.error("Error loading reservation:", err);
    res.status(500).send('Error loading reservation');
  }
});


/* =============================
   DELETE - Cancel reservation - IMPORTANT: ONLY ADMINS CAN DELETE RESERVATIONS - USERS CAN ONLY CANCEL
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