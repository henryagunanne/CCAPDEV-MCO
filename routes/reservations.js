// routes/reservations.js
const express = require('express');
const Reservation = require('../models/Reservation');
const Flight = require('../models/Flight');
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

// Middleware to ensure admin cannot access user routes
function isAdmin(req, res, next) {
  if (req.session.user && req.session.user.role === 'Admin') {
    return res.status(403).render('error/access-denied', { 
      title: 'Access Denied',
      isAdmin: req.session.user?.role === 'Admin'
    });  
  }
  next();
}

//1
/* =============================
   CREATE
============================= */

//  Create Reservation Route
router.post("/create", isAuthenticated, isAdmin, async (req, res) => {
  try {
    const { flight, returnFlight, travelClass, tripType, passengers, totalAmount } = req.body;

    const parsedPassengers = Array.isArray(passengers)
      ? passengers
      : JSON.parse(passengers);
      

    // Create new reservation with correct field names
    const newReservation = new Reservation({
      userId: req.session.user?._id || null,
      flight: returnFlight ? [flight, returnFlight] : [flight], // field name matches schema
      travelClass,
      tripType,
      passengers: parsedPassengers,
      price: parseFloat(totalAmount) || 0, // required Price field
      status: "Pending"
    });

    await newReservation.save();
    console.log("New reservation created:", newReservation);
    res.status(200).json({ redirect: `/reservations/${newReservation._id}/confirmation` });
  } catch (err) {
    console.error("Error creating reservation:", err);
    res.status(500).send("Error creating reservation");
  }
});

//2
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
    const departDate = req.query.departDate || flight.departureDate;
    const returnDate = req.query.returnDate || null;

    // Fetch all reservations for this flight (exclude cancelled)
    const reservations = await Reservation.find({
      flight: flightId,
      status: { $ne: 'Cancelled' }
    }).lean();

    // Collect all occupied seat numbers
    const occupiedSeats = reservations.flatMap(r =>
      r.passengers.map(p => p.seatNumber)
    ).filter(Boolean);

    // Optionally, also get return flights if round trip
    let returnFlights = [];
    if (tripType === "Round-Trip") {
      const allReturnFlights = await Flight.find({
        origin: flight.destination,
        destination: flight.origin
      }).lean();

      const departDateObj = new Date(flight.departureDate + "T00:00:00");
      returnFlights = allReturnFlights
        .filter(f => new Date(f.departureDate + "T00:00:00") > departDateObj)
        .sort((a, b) => new Date(a.departureDate) - new Date(b.departureDate));
    }

    // Pass occupiedSeats to Handlebars as JSON
    res.render("reservations/reservation", {
      title: "Book Your Flight",
      flight,
      travelClass,
      tripType,
      departDate,
      returnDate,
      returnFlights,
      occupiedSeats: JSON.stringify(occupiedSeats),
    });

  } catch (err) {
    console.error("Error loading book page:", err);
    res.status(500).send("Internal Server Error");
  }
});


/* =============================
   BOOK PAGE - Select Route & Flights
============================= */
router.get('/book-flight', isAuthenticated, async (req, res) => {
  try {
    // Get distinct origins and destinations from flights
    const origins = await Flight.distinct('origin');
    const destinations = await Flight.distinct('destination');

    // Render booking page
    res.render('reservations/book-flight', {
      title: 'Book Your Flight',
      origins,
      destinations,
      occupiedSeats: JSON.stringify([]) // placeholder for safety
    });
  } catch (err) {
    console.error('Error loading Book Flight page:', err);
    res.status(500).send('Error loading Book Flight page.');
  }
});

/* =============================
   SEARCH FLIGHTS (AJAX)
============================= */
router.get('/search', isAuthenticated, async (req, res) => {
  try {
    const { origin, destination } = req.query;

    if (!origin || !destination) {
      return res.status(400).json({ flights: [] });
    }

    // Find flights that match the route
    const flights = await Flight.find({ origin, destination }).lean();

    console.log(`✈️ Found ${flights.length} flights from ${origin} → ${destination}`);
    res.json({ flights });
  } catch (err) {
    console.error('Error fetching flights:', err);
    res.status(500).json({ flights: [] });
  }
});



//3
/* =============================
   CONFIRM
============================= */
// Confirmation Route 
router.get("/:id/confirmation", isAuthenticated, async (req, res) => {
  try {
    // fetch reservation data
    const reservationDoc = await Reservation.findById(req.params.id)
      .populate("flight")
      .populate("userId");

    if (!reservationDoc) return res.status(404).send("Reservation not found");

    // convert to plain object early
    const reservation = reservationDoc.toObject();

    // compute totals correctly
    reservation.mealTotal = reservation.passengers.reduce(
      (sum, p) => sum + (p.meal && p.meal !== "None" ? 150 : 0),
      0
    );
    reservation.baggageTotal = reservation.passengers.reduce(
      (sum, p) => sum + ((p.baggageAllowance || 0) * 50),
      0
    );

    // render with updated totals
    res.render("reservations/confirmation", { 
      title: "Booking Confirmed",
      reservation 
    });
  } catch (err) {
    console.error("Error loading reservation:", err);
    res.status(500).send("Error loading reservation");
  }
});

//4
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

//5
// POST /reservations/cancel/:reservationId - Cancel a reservation
router.post('/cancel/:reservationId', isAuthenticated, isAdmin, async (req, res) => {
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

    res.status(200).json({ 
      success: true, 
      message: 'Reservation Cancelled',
      cancelledReservation
    });
  }catch (err) {
    console.error('Reservation update error:', err);
    res.status(500).send('Server error during Reservation update');
  }
});

//6
// GET reservations/:id/edit - Display edit page
router.get('/:id/edit', isAuthenticated, isAdmin, async (req, res) => {
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

    // Fetch real occupied seats (excluding current reservation)
      const otherReservations = await Reservation.find({
        flight: outboundFlight._id,
        _id: { $ne: reservation._id },
        status: { $ne: 'Cancelled' }
      }).lean();

      const realOccupiedSeats = otherReservations.flatMap(r =>
        r.passengers.map(p => p.seatNumber)
      );

      // Generate random static demo occupied seats safely
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

      // Get passenger seats from this reservation
      const currentPassengerSeats = reservation.passengers.map(p => p.seatNumber);

      // Generate demo occupied seats without conflicting with user seats
      const staticOccupiedSeats = getRandomStaticSeats(currentPassengerSeats);

      // Merge & remove duplicates
      const occupiedSeats = [...new Set([...realOccupiedSeats, ...staticOccupiedSeats])];


    // Pass to Handlebars properly as JSON string
    res.render('reservations/edit-reservation', {
      title: 'Edit Reservation',
      reservation,
      outboundFlight,
      returnFlight,
      occupiedSeats: JSON.stringify(occupiedSeats || []), // keep valid JSON
    });

  } catch (err) {
    console.error("Error loading edit page:", err);
    res.status(500).send('Server error loading edit page.');
  }
});


//7
      // POST /reservations/:id/edit - Handle edit submission
router.post('/:id/edit', isAuthenticated, isAdmin, async (req, res) => {
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

    // Define pricing
    const seatPricing = { first: 5000, business: 3000, economy: 1500 };
    const travelClass = (reservation.travelClass || "economy").toLowerCase();

    // Compute totals
    reservation.mealTotal = reservation.passengers.reduce(
      (sum, p) => sum + (p.meal && p.meal !== "None" ? 150 : 0),
      0
    );
    reservation.baggageTotal = reservation.passengers.reduce(
      (sum, p) => sum + ((p.baggageAllowance || 0) * 50),
      0
    );
        // Compute seat total dynamically by seat row
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



    // Compute grand total
    const baseFare = reservation.flight?.[0]?.price || 0;
    const returnFare = reservation.flight?.[1]?.price || 0;

    reservation.totalFinalPrice =
      baseFare + returnFare + reservation.mealTotal + reservation.baggageTotal + reservation.seatTotal;

    // Render
    res.status(200).render('reservations/edit-confirmation', {
      title: 'Reservation Updated',
      reservation,
    });
  } catch (err) {
    console.error('Error updating reservation:', err);
    res.status(500).send('Error updating reservation');
  }
});


router.get("/seats/:flightId", async (req, res) => {
  try {
    const reservations = await Reservation.find({ flight: req.params.flightId });

    const takenSeats = [];
    reservations.forEach(r => {
      r.passengers.forEach(p => {
        if (p.seatNumber) takenSeats.push(p.seatNumber);
      });
    });

    res.json({ occupiedSeats: takenSeats });
  } catch (err) {
    console.error("Seat fetch error:", err);
    res.json({ occupiedSeats: [] });
  }
});


//8
/* =============================
   READ - View single reservation
============================= */
router.get('/:id', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const reservation = await Reservation.findById(req.params.id)
      .populate('flight')
      .lean();

    if (!reservation) return res.status(404).send('Reservation not found');
    res.render('reservations/details', { title: 'Booking Details', reservation });
  } catch (err) {
    console.error("Error loading reservation:", err);
    res.status(500).send('Error loading reservation');
  }
});

// Update Reservation (POST)
router.post('/update/:id', isAuthenticated, isAdmin, async (req, res) => {
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
    console.error("Error updating reservation:", err);
    res.status(500).send("Error updating reservation");
  }
});


/* =============================
   DELETE - Cancel reservation - IMPORTANT: ONLY ADMINS CAN DELETE RESERVATIONS - USERS CAN ONLY CANCEL
============================= /
router.post('/delete/:id', isAuthenticated, async (req, res) => {
  try {
    await Reservation.findByIdAndDelete(req.params.id);
    console.log('Reservation cancelled');
    res.redirect('/reservations/myBookings');
  } catch (err) {
    res.status(500).send('Error deleting reservation');
  }
}); */




module.exports = router;