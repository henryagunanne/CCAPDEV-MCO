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

    const travelClass = req.query.travelClass || 'Economy';
    const tripType = req.query.tripType || 'One-Way';
    const departDate = req.query.depart || '';
    const returnDate = req.query.return || '';

    // ✅ 1. Fetch reserved seats for this flight
    const existingReservations = await Reservation.find({
      flight: flightId,
      status: { $ne: 'Cancelled' } // exclude cancelled
    }).lean();

    // Flatten seat numbers from all passengers
    const occupiedSeats = existingReservations.flatMap(r =>
      r.passengers.map(p => p.seatNumber)
    );

    // ✅ 2. Load valid return flights (future only)
    const departDateObj = new Date(`${flight.departureDate}T00:00:00Z`);
    const today = new Date();
    const allReturnFlights = await Flight.find({
      origin: flight.destination,
      destination: flight.origin
    }).lean();

    const returnFlights = allReturnFlights.filter(f => {
      const fDate = new Date(`${f.departureDate}T00:00:00Z`);
      return fDate > today && fDate > departDateObj;
    }).sort((a, b) => new Date(`${a.departureDate}T00:00:00Z`) - new Date(`${b.departureDate}T00:00:00Z`));

    // ✅ 3. Render with occupied seat list
    res.render('reservations/reservation', {
      title: 'Book Your Flight',
      flight,
      travelClass,
      tripType,
      departDate,
      returnDate,
      returnFlights,
      occupiedSeats: JSON.stringify(occupiedSeats) // pass to JS
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
      price: parseFloat(totalAmount) || 0, // ✅ required Price field
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
      .populate("flight")     // get flight details
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
      .populate("flight")
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

// GET /reservations/edit/:id
router.get('/edit/:id', isAuthenticated, async (req, res) => {
  try {
    const id = req.params.id;
    const reservation = await Reservation.findById(id)
      .populate({
        path: 'flight',
        model: 'Flight'
      })
      .lean();

    if (!reservation) return res.status(404).send('Reservation not found');

    const outboundFlight = reservation.flight?.[0] || reservation.flight;
    const returnFlight   = reservation.flight?.[1] || null;

    res.render('reservations/edit-reservation', {
      title: 'Edit Reservation',
      reservation,
      outboundFlight,
      returnFlight,
      hasReturn: !!returnFlight,
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
      .populate('flight')  // ✅ plural
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