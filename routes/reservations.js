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
    // 🧭 Include tripType here
    const { flight, returnFlight, travelClass, tripType, passengers, totalAmount } = req.body;

    // passengers is already an array since we send JSON
    const parsedPassengers = Array.isArray(passengers)
      ? passengers
      : JSON.parse(passengers);

    const seatNumbers = parsedPassengers.map(p => p.seatNumber);

    // ✅ Include tripType in Reservation object
    const newReservation = new Reservation({
      userId: req.session.user?._id || null,
     flights: returnFlight ? [flight, returnFlight] : [flight],
      travelClass,
      tripType, // ✅ This was missing
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

  const existingSeats = await Reservation.find({
  flights: req.body.flight,
  "passengers.seatNumber": { $in: selectedSeatNumbers },
  status: { $ne: "Cancelled" }
});

if (existingSeats.length > 0) {
  return res.status(400).send("One or more selected seats are already booked.");
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

// GET /reservation/edit/:id 
router.get('/edit/:id', isAuthenticated, async (req, res) => {
  try {
    const id = req.params.id;
    const reservation = await Reservation.findById(id)
    .populate('flight')
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

//  API endpoint for fetching already-occupied seats for a flight
router.get("/api/occupied-seats/:flightId", async (req, res) => {
  try {
    const reservations = await Reservation.find({
      flights: req.params.flightId,
      status: { $ne: "Cancelled" } // exclude cancelled reservations
    });

    // Collect seat numbers from passengers
    const occupiedSeats = reservations.flatMap(r =>
      r.passengers.map(p => p.seatNumber)
    );

    res.json({ occupied: occupiedSeats });
  } catch (error) {
    console.error("Error fetching occupied seats:", error);
    res.status(500).json({ error: "Failed to fetch occupied seats" });
  }
});


module.exports = router;
