// routes/reservations.js
const express = require('express');
const router = express.Router();
const Reservation = require('../models/Reservation');
const Flight = require('../models/Flight');
// const User = require('../models/User');

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
router.get('/book', async (req, res) => {
  try {
    console.log("🧭 /reservations/book accessed");

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




// ✅ Confirmation Route 
router.get("/:id/confirmation", isAuthenticated, async (req, res) => {
  try {
    // fetch reservation data
    const reservationDoc = await Reservation.findById(req.params.id)
      .populate("flight")
      .populate("userId");

    if (!reservationDoc) return res.status(404).send("Reservation not found");

    // convert to plain object early
    const reservation = reservationDoc.toObject();

    // ✅ compute totals correctly
    reservation.mealTotal = reservation.passengers.reduce(
      (sum, p) => sum + (p.meal && p.meal !== "None" ? 150 : 0),
      0
    );
    reservation.baggageTotal = reservation.passengers.reduce(
      (sum, p) => sum + ((p.baggageAllowance || 0) * 50),
      0
    );

    // ✅ render with updated totals
    res.render("reservations/confirmation", { 
      title: "Booking Confirmed",
      reservation,
      user: req.session.user
    });
  } catch (err) {
    console.error("❌ Error loading reservation:", err);
    res.status(500).send("Error loading reservation");
  }
});

/* =============================
   MY BOOKINGS PAGE
============================= */

// GET reservations/my-bookings - render my reservations page
router.get('/my-bookings', isAuthenticated, async (req, res) => {
  try {
    const userId = req.session.user._id;
    const reservation = await Reservation.find({ userId })
      .populate("flight")
      .lean(); 

    res.render('reservations/myBookings', {
      title: 'My Bookings',
      reservation,
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

    const cancelled = await Reservation.findByIdAndUpdate(
      reservationId,
      { status: 'Cancelled' },
      { new: true }
    );

    if (!cancelled) {
      return res.status(404).send('Reservation not found');
    }

    const cancelledReservation = await cancelled.populate('flight');

    // ✅ If you need a plain JS object (for res.json)
    const plainCancelled = cancelledReservation.toObject();

    res.json({ 
      success: true, 
      message: 'Reservation Cancelled',
      cancelledReservation: plainCancelled
    });
  } catch (err) {
    console.error('❌ Reservation update error:', err);
    res.status(500).send('Server error during Reservation update');
  }
});

// GET reservations/:id/edit - Display edit page
router.get('/:id/edit', isAuthenticated, async (req, res) => {
  try {
    const reservation = await Reservation.findById(req.params.id)
      .populate('flight')
      .lean();

    if (!reservation) return res.status(404).send('Reservation not found');

    // Handle outbound/return flights correctly
    const outboundFlight = Array.isArray(reservation.flight)
      ? reservation.flight[0]
      : reservation.flight;
    const returnFlight = Array.isArray(reservation.flight) && reservation.flight[1]
      ? reservation.flight[1]
      : null;

    // ✅ Fetch real occupied seats (excluding current reservation)
      const otherReservations = await Reservation.find({
        flight: outboundFlight._id,
        _id: { $ne: reservation._id },
        status: { $ne: 'Cancelled' }
      }).lean();

      const realOccupiedSeats = otherReservations.flatMap(r =>
        r.passengers.map(p => p.seatNumber)
      );

      // 🪑 Generate random static demo occupied seats safely
      function getRandomStaticSeats(currentPassengerSeats = []) {
        const allSeats = [
          "1A","1B","1C","1D","1E","1F",
          "2A","2B","2C","2D","2E","2F",
          "3A","3B","3C","3D","3E","3F",
          "4A","4B","4C","4D","4E","4F",
          "5A","5B","5C","5D","5E","5F",
          "6A","6B","6C","6D","6E","6F",
          "7A","7B","7C","7D","7E","7F",
          "8A","8B","8C","8D","8E","8F",
          "9A","9B","9C","9D","9E","9F",
          "10A","10B","10C","10D","10E","10F"
        ];

        // Exclude seats currently occupied by this reservation
        const availableSeats = allSeats.filter(seat => !currentPassengerSeats.includes(seat));

        // Choose random 8–12 demo seats
        const count = Math.floor(Math.random() * 5) + 8; // random between 8–12
        const shuffled = availableSeats.sort(() => 0.5 - Math.random());
        return shuffled.slice(0, count);
      }

      // 🎟 Get passenger seats from this reservation
      const currentPassengerSeats = reservation.passengers.map(p => p.seatNumber);

      // Generate demo occupied seats without conflicting with user seats
      const staticOccupiedSeats = getRandomStaticSeats(currentPassengerSeats);

      // ✅ Merge & remove duplicates
      const occupiedSeats = [...new Set([...realOccupiedSeats, ...staticOccupiedSeats])];


    // ✅ Pass to Handlebars properly as JSON string
    res.render('reservations/edit-reservation', {
      title: 'Edit Reservation',
      reservation,
      passengers: reservation.passengers.length > 0,
      user: req.session.user,
      outboundFlight,
      returnFlight,
      occupiedSeats: JSON.stringify(occupiedSeats || []), // keep valid JSON
    });

  } catch (err) {
    console.error("❌ Error loading edit page:", err);
    res.status(500).send('Server error loading edit page.');
  }
});

// POST /reservations/:id/edit - Handle edit submission
router.post('/:id/edit', isAuthenticated, async (req, res) => {
  try {
    const reservationId = req.params.id;
    const { passengersJSON, totalPrice } = req.body;

    const updatedPassengers = JSON.parse(passengersJSON || "[]");
    const existingReservation = await Reservation.findById(reservationId);

    if (!existingReservation) {
      return res.status(404).send('Reservation not found');
    }

    // Update and repopulate
    const updatedReservationDoc = await Reservation.findByIdAndUpdate(
      reservationId,
      {
        passengers: updatedPassengers,
        price: parseFloat(totalPrice) || existingReservation.price,
        status: existingReservation.status,
      },
      { new: true }
    )
      .populate('flight')
      .populate('userId');

    const reservation = updatedReservationDoc.toObject();

    // 🧮 Define pricing
    const seatPricing = { first: 5000, business: 3000, economy: 1500 };
    const travelClass = (reservation.travelClass || "economy").toLowerCase();

    // ✅ Compute totals
    reservation.mealTotal = reservation.passengers.reduce(
      (sum, p) => sum + (p.meal && p.meal !== "None" ? 150 : 0),
      0
    );
    reservation.baggageTotal = reservation.passengers.reduce(
      (sum, p) => sum + ((p.baggageAllowance || 0) * 50),
      0
    );
        // 🧮 Compute seat total dynamically by seat row
    reservation.seatTotal = reservation.passengers.reduce((sum, p) => {
      if (!p.seatNumber) return sum;

      const seatRow = parseInt(p.seatNumber); // extract row number (e.g., 1 from "1A", 4 from "4D")
      let seatClass = "economy";

      if (seatRow <= 2) seatClass = "first";
      else if (seatRow <= 4) seatClass = "business";
      else seatClass = "economy";

      const seatPricing = { first: 5000, business: 3000, economy: 1500 };
      return sum + (seatPricing[seatClass] || 0);
    }, 0);



    // ✅ Compute grand total
    const baseFare = reservation.flight?.[0]?.price || 0;
    const returnFare = reservation.flight?.[1]?.price || 0;

    reservation.totalFinalPrice =
      baseFare + returnFare + reservation.mealTotal + reservation.baggageTotal + reservation.seatTotal;

    // ✅ Render
    res.render('reservations/edit-confirmation', {
      title: 'Reservation Updated',
      reservation,
    });
  } catch (err) {
    console.error('❌ Error updating reservation:', err);
    res.status(500).send('Error updating reservation');
  }
});

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


// ✅ Update Reservation (POST)
router.post('/update/:id', isAuthenticated, async (req, res) => {
  try {
    const { passengers, totalPrice } = req.body;
    const updated = await Reservation.findByIdAndUpdate(
      req.params.id,
      {
        passengers,
        price: totalPrice
      },
      { new: true }
    );
    res.json({ success: true, updated });
  } catch (err) {
    console.error("❌ Error updating reservation:", err);
    res.status(500).send("Error updating reservation");
  }
});


/* =============================
   DELETE - Cancel reservation - IMPORTANT: ONLY ADMINS CAN DELETE RESERVATIONS - USERS CAN ONLY CANCEL
============================= /
router.post('/delete/:id', isAuthenticated, async (req, res) => {
  try {
    await Reservation.findByIdAndDelete(req.params.id);
    console.log('❌ Reservation deleted');
    res.redirect('/reservations/my-bookings');
  } catch (err) {
    res.status(500).send('Error deleting reservation');
  }
}); */

module.exports = router;
