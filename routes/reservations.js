// routes/reservations.js
const express = require('express');
const Reservation = require('../models/Reservation');
const Flight = require('../models/Flight');
const AircraftLayout = require('../models/AircraftLayout');
const SeatAllocation = require('../models/SeatAllocation');
const BookingIntegrityState = require('../models/BookingIntegrityState');
const {
  BookingInputError,
  validateCreateBody,
  validateEditBody,
  validateObjectId
} = require('../services/bookingValidation');
const {
  BookingConflictError,
  createReservation,
  updateReservation,
  cancelReservation
} = require('../services/bookingService');
const { calculateReservationPrice } = require('../services/bookingPricing');
const { bookingLimits, cancellationLimits, checkInLimits, flightSearchLimits } = require('../middleware/rateLimits');
const { recordAuditEvent } = require('../services/auditService');
const { getStoredPassport } = require('../services/passportEncryption');
const router = express.Router();
const logger = require('../logs/logger'); 


// Helper middleware to check if user is authenticated
function isAuthenticated(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.status(403).render('error/access-denied', { 
      title: 'Access Denied',
      isAdmin: false
    });
  }
  return next();
}

// Middleware to ensure admin cannot access user routes
function isAdmin(req, res, next) {
  if (req.session.user && req.session.user.role === 'Admin') {
    return res.status(403).render('error/user-only', { 
      title: 'Access Denied',
    });
  }
  return next();
}

/* =============================
   CREATE — WITH CHECK-IN READY PASSENGERS
============================= */

router.post("/create", ...bookingLimits, isAuthenticated, isAdmin, async (req, res) => {
  try {
    const booking = validateCreateBody(req.body);
    const userId = validateObjectId(req.session.user._id, 'User ID');
    const reservation = await createReservation({ userId, booking });
    await recordAuditEvent({
      actorId: req.session.user._id,
      actorRole: req.session.user.role || 'user',
      action: 'reservation:create',
      resourceType: 'Reservation',
      resourceId: reservation._id
    });
    logger.info('Reservation created.');
    return res.status(200).json({
      redirect: `/reservations/${reservation._id}/confirmation`,
      reservationId: reservation._id,
      price: reservation.price
    });
  } catch (err) {
    if (err instanceof BookingInputError || err instanceof BookingConflictError) {
      return res.status(err.statusCode).json({ success: false, message: err.message });
    }
    logger.error("Reservation creation failed.", { code: err.code || 'BOOKING_ERROR' });
    return res.status(500).json({ success: false, message: 'Unable to create reservation.' });
  }
});




//2
/* =============================
   BOOK PAGE - Show booking form
============================= */
router.get('/book/:flightId', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const flightId = validateObjectId(req.params.flightId, 'Flight ID');
    const integrityState = await BookingIntegrityState.findById('booking-integrity-v1').lean();
    if (!integrityState?.ready || integrityState.version !== 1 ||
        integrityState.indexName !== 'unique_flight_seat') {
      return res.status(409).json({ success: false, message: 'Booking integrity setup is not complete.' });
    }
    const flight = await Flight.findById(flightId).lean();
    if (!flight) return res.status(404).send('Flight not found');
    const layout = flight.aircraftLayoutId
      ? await AircraftLayout.findOne({ _id: flight.aircraftLayoutId, active: true }).lean()
      : null;

    const travelClass = req.query.travelClass || 'Economy';
    const tripType = req.query.tripType || 'One-Way';
    if (typeof travelClass !== 'string' ||
        !['Economy', 'Premium Economy', 'Business', 'First'].includes(travelClass)) {
      throw new BookingInputError('Select a valid travel class.');
    }
    if (typeof tripType !== 'string' || !['One-Way', 'Round-Trip'].includes(tripType)) {
      throw new BookingInputError('Select a valid trip type.');
    }
    const departDate = req.query.departDate || flight.departureDate;
    const returnDate = req.query.returnDate || null;

    const allocations = await SeatAllocation.find({ flightId }).select('seatNumber').lean();
    const occupiedSeats = allocations.map(allocation => allocation.seatNumber);

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
      layout,
      travelClass,
      tripType,
      departDate,
      returnDate,
      returnFlights,
      occupiedSeats: JSON.stringify(occupiedSeats),
    });

  } catch (err) {
    if (err instanceof BookingInputError) return res.status(err.statusCode).send(err.message);
    logger.error('Book page request failed.', { code: err.code || 'BOOK_PAGE_ERROR' });
    res.status(500).send("Internal Server Error");
  }
});


/* =============================
   BOOK PAGE - Select Route & Flights
============================= */
router.get('/book-flight', isAuthenticated, isAdmin, async (req, res) => {
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
    logger.error('Book-flight page request failed.', { code: err.code || 'BOOK_FLIGHT_PAGE_ERROR' });
    res.status(500).send('Error loading Book Flight page.');
  }
});

/* =============================
   SEARCH FLIGHTS (AJAX)
============================= */
router.get('/search', ...flightSearchLimits, isAuthenticated, async (req, res) => {
  try {
    const { origin, destination } = req.query;

    if (typeof origin !== 'string' || typeof destination !== 'string' ||
        !origin.trim() || !destination.trim()) {
      return res.status(400).json({ flights: [] });
    }

    // Find flights that match the route
    const flights = await Flight.find({
      origin: origin.trim(),
      destination: destination.trim(),
      status: { $in: ['Scheduled', 'On Time', 'Delayed'] },
      departureDate: { $gte: new Date().toISOString().slice(0, 10) },
      aircraftLayoutId: { $ne: null }
    }).lean();

    logger.info('Flight availability search completed.', { resultCount: flights.length });
    res.json({ flights });
  } catch (err) {
    logger.error('Flight availability search failed.', { code: err.code || 'FLIGHT_SEARCH_ERROR' });
    res.status(500).json({ flights: [] });
  }
});



//3
/* =============================
   CONFIRM
============================= */
// Confirmation Route 
router.get("/:id/confirmation", isAuthenticated, isAdmin, async (req, res) => {
  try {
    const reservationId = validateObjectId(req.params.id, 'Reservation ID');
    const reservationDoc = await Reservation.findOne({ _id: reservationId, userId: req.session.user._id })
      .populate("flight")
      .populate("userId");

    if (!reservationDoc) return res.status(404).send("Reservation not found");

    // convert to plain object early
    const reservation = reservationDoc.toObject();
    reservation.passengers = reservation.passengers.map(passenger => ({
      fullName: passenger.fullName,
      seatNumber: passenger.seatNumber,
      returnSeatNumber: passenger.returnSeatNumber,
      meal: passenger.meal,
      baggageAllowance: passenger.baggageAllowance
    }));
    reservation.baseFareTotal = reservation.flight[0].price * reservation.passengers.length;
    reservation.returnFareTotal = (reservation.flight[1]?.price || 0) * reservation.passengers.length;

    // compute totals correctly
    reservation.mealTotal = reservation.passengers.reduce(
      (sum, p) => sum + (p.meal && p.meal !== "None" ? 150 : 0),
      0
    );
    reservation.baggageTotal = reservation.passengers.reduce(
      (sum, p) => sum + ((p.baggageAllowance || 0) * 50),
      0
    );
    const seatTariffs = { First: 5000, Business: 3000, 'Premium Economy': 1700, Economy: 1500 };
    reservation.seatTotal = reservation.passengers.length * reservation.flight.length *
      seatTariffs[reservation.travelClass];

    // render with updated totals
    res.render("reservations/confirmation", { 
      title: "Booking Confirmed",
      reservation 
    });
  } catch (err) {
    if (err instanceof BookingInputError) return res.status(err.statusCode).send(err.message);
    logger.error('Reservation confirmation request failed.', { code: err.code || 'RESERVATION_READ_ERROR' });
    res.status(500).send("Error loading reservation");
  }
});

// =============================
// CHECK-IN PAGE (VIEW)
// =============================
router.get("/check-in", async (req,res)=>{
    try{
        res.render("reservations/check-in");
    }catch(err){
        logger.error('Check-in page request failed.', { code: err.code || 'CHECK_IN_PAGE_ERROR' });
        res.status(500).send("Error loading reservation");
    }
});

// =============================
// CHECK-IN (POST) — With Flight Populate
// =============================
router.post("/check-in", ...checkInLimits, async (req,res)=>{
    try{
        let { pnr, fullName } = req.body;
        if(typeof pnr !== 'string' || typeof fullName !== 'string' || !pnr.trim() || !fullName.trim())
            return res.json({ success:false, message:"Missing fields" });

        pnr = pnr.trim().toUpperCase();
        fullName = fullName.trim();
        if (!/^[A-Z0-9]{6,12}$/.test(pnr)) {
            return res.json({ success:false, message:"Invalid PNR or Name" });
        }

        const reservation = await Reservation.findOne({
            bookingReference: pnr
        }).populate("flight");

        if(!reservation)
            return res.json({ success:false, message:"Invalid PNR or Name" });

        
        const idx = reservation.passengers.findIndex(
            p => p.fullName.trim().toLowerCase() === fullName.toLowerCase()
        );

        if(idx === -1) return res.json({ success:false, message:"Invalid PNR or Name" });
        const passenger = reservation.passengers[idx];


        // Fix for old DB documents
        if(!passenger.boardingPass || typeof passenger.boardingPass !== "object"){
            passenger.boardingPass = { outbound:null, return:null };
        }

        if(passenger.checkedIn)
            return res.json({
                success:false,
                message:'Passenger is already checked in.'
            });


        let outboundBP = "BP-" + Math.floor(100000 + Math.random()*900000);
        let returnBP = reservation.flight.length > 1
            ? "BP-" + Math.floor(100000 + Math.random()*900000)
            : outboundBP;


        passenger.checkedIn = true;
        passenger.boardingPass = { outbound: outboundBP, return: returnBP };
        await reservation.save();
        await recordAuditEvent({
          actorRole: 'co-passenger',
          action: 'reservation:check-in',
          resourceType: 'Reservation',
          resourceId: reservation._id
        });

        return res.json({
            success:true,
            reservation: {
              bookingReference: reservation.bookingReference,
              flight: reservation.flight.map(flight => ({
                flightNumber: flight.flightNumber,
                origin: flight.origin,
                destination: flight.destination
              })),
              passenger: {
                fullName: passenger.fullName,
                seatNumber: passenger.seatNumber,
                returnSeatNumber: passenger.returnSeatNumber,
                checkedIn: passenger.checkedIn,
                boardingPass: passenger.boardingPass
              }
            }
        });


    }catch(err){
        logger.error('Check-in request failed.', { code: err.code || 'CHECK_IN_ERROR' });
        return res.json({ success:false, message:"Server error" });
    }
});




//4
// GET reservations/my-bookings - render my reservations page
router.get('/my-bookings', isAuthenticated, isAdmin, async (req, res) => {
  const userId = req.session.user._id;

  try {
    const reservation = await Reservation.find({userId})
      .populate("flight")
      .lean(); 
    for (const booking of reservation) {
      booking.passengers = booking.passengers.map(passenger => ({
        ...passenger,
        passport: undefined,
        passportEncrypted: undefined,
        passportFingerprint: undefined,
        passportLast3: passenger.passportLast3 || ''
      }));
    }

    res.render('reservations/myBookings', {
      title: 'My Bookings',
      reservation,
      user: req.session.user
    })
  }catch (err){
    logger.error('Booking list request failed.', { code: err.code || 'BOOKING_LIST_ERROR' });
    res.status(500).send("Error loading reservation");
  }
});

//5
// POST /reservations/cancel/:reservationId - Cancel a reservation
router.post('/cancel/:reservationId', ...cancellationLimits, isAuthenticated, isAdmin, async (req, res) => {
  try{
    const reservationId = validateObjectId(req.params.reservationId, 'Reservation ID');
    const reservation = await Reservation.findOne({
      _id: reservationId,
      userId: req.session.user._id
    }).select('+passengers.passportEncrypted +passengers.passportFingerprint');
    if (!reservation) return res.status(404).send('Reservation not found');
    const cancelledReservation = await cancelReservation(reservation);
    if (!cancelledReservation) {
      return res.status(404).send('Reservation not found');
    }
    await recordAuditEvent({
      actorId: req.session.user._id,
      actorRole: req.session.user.role || 'user',
      action: 'reservation:cancel',
      resourceType: 'Reservation',
      resourceId: cancelledReservation._id
    });
    logger.info('Reservation cancelled.');
    res.status(200).json({
      success: true,
      message: 'Reservation Cancelled',
      reservationId: String(cancelledReservation._id)
    });
  }catch (err) {
    if (err instanceof BookingInputError || err instanceof BookingConflictError) {
      return res.status(err.statusCode).json({ success: false, message: err.message });
    }
    logger.error('Reservation cancellation failed.', { code: err.code || 'RESERVATION_CANCEL_ERROR' });
    res.status(500).json({ success: false, message: 'Server error during reservation update.' });
  }
});

//6
// GET reservations/:id/edit - Display edit page
router.get('/:id/edit', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const reservationId = validateObjectId(req.params.id, 'Reservation ID');
    const reservation = await Reservation.findOne({ _id: reservationId, userId: req.session.user._id })
      .populate('flight')
      .select('+passengers.passport +passengers.passportEncrypted +passengers.passportFingerprint')
      .lean();

    if (!reservation) return res.status(404).send('Reservation not found');
    if (reservation.status === 'Cancelled') return res.status(409).send('Cancelled reservations cannot be edited.');

    const [outboundFlight, returnFlight] = reservation.flight;
    const allocations = await SeatAllocation.find({
      flightId: { $in: reservation.flight.map(flight => flight._id) },
      reservationId: { $ne: reservation._id }
    }).select('flightId seatNumber').lean();
    const occupiedByFlight = {};
    for (const flight of reservation.flight) {
      occupiedByFlight[String(flight._id)] = allocations
        .filter(allocation => String(allocation.flightId) === String(flight._id))
        .map(allocation => allocation.seatNumber);
    }
    const layouts = await AircraftLayout.find({
      _id: { $in: reservation.flight.map(flight => flight.aircraftLayoutId).filter(Boolean) },
      active: true
    }).lean();
    const layoutByFlight = Object.fromEntries(reservation.flight.map(flight => [
      String(flight._id),
      layouts.find(layout => String(layout._id) === String(flight.aircraftLayoutId)) || null
    ]));
    reservation.passengers = reservation.passengers.map(passenger => ({
      ...passenger,
      requiresMealConsent: passenger.meal !== 'None',
      passportForOwner: passenger.checkedIn ? undefined : getStoredPassport(passenger),
      passport: undefined,
      passportEncrypted: undefined,
      passportFingerprint: undefined
    }));

    res.render('reservations/edit-reservation', {
      title: 'Edit Reservation',
      reservation,
      outboundFlight,
      returnFlight,
      occupiedByFlight: JSON.stringify(occupiedByFlight),
      layoutsByFlight: JSON.stringify(layoutByFlight)
    });

  } catch (err) {
    if (err instanceof BookingInputError) return res.status(err.statusCode).send(err.message);
    logger.error('Reservation edit page request failed.', { code: err.code || 'RESERVATION_EDIT_PAGE_ERROR' });
    res.status(500).send('Server error loading edit page.');
  }
});


//7
// POST /reservations/:id/edit - Handle edit submission
router.post('/:id/edit', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const reservationId = validateObjectId(req.params.id, 'Reservation ID');
    const existingReservation = await Reservation.findOne({ _id: reservationId, userId: req.session.user._id })
      .select('+passengers.passportEncrypted +passengers.passportFingerprint');
    if (!existingReservation) return res.status(404).send('Reservation not found');
    const passengers = validateEditBody(req.body, existingReservation.tripType);
    const expectedFlightIds = existingReservation.flight.map(id => String(id));
    if (req.body.flight && String(req.body.flight) !== expectedFlightIds[0]) {
      throw new BookingInputError('Flight selection cannot be changed while editing.');
    }
    if (req.body.returnFlight &&
        String(req.body.returnFlight) !== (expectedFlightIds[1] || '')) {
      throw new BookingInputError('Flight selection cannot be changed while editing.');
    }
    if (req.body.reservationId && String(req.body.reservationId) !== reservationId) {
      throw new BookingInputError('Reservation ID does not match the request.');
    }
    if (existingReservation.passengers.some(passenger =>
      !passenger.passportEncrypted?.ciphertext || !passenger.passportFingerprint
    )) {
      return res.status(409).json({
        success: false,
        message: 'Passenger passport migration must be completed before this reservation can be edited.'
      });
    }
    if (existingReservation.passengers.some((existing, index) =>
      existing.checkedIn && (
        passengers[index]?.fullName !== existing.fullName ||
        passengers[index]?.ageCategory !== existing.ageCategory ||
        passengers[index]?.gender !== existing.gender ||
        passengers[index]?.passport !== undefined
      )
    )) {
      throw new BookingInputError('Passenger identity details cannot be corrected after check-in.');
    }
    const updatedReservationDoc = await updateReservation({
      reservation: existingReservation,
      passengers
    });
    await recordAuditEvent({
      actorId: req.session.user._id,
      actorRole: req.session.user.role || 'user',
      action: 'reservation:update',
      resourceType: 'Reservation',
      resourceId: updatedReservationDoc._id
    });
    logger.info('Reservation updated.');
    res.status(200).json({
      success: true,
      redirect: `/reservations/${reservationId}/confirmation`
    });
  } catch (err) {
    if (err instanceof BookingInputError || err instanceof BookingConflictError) {
      return res.status(err.statusCode).send(err.message);
    }
    logger.error('Reservation edit failed.', { code: err.code || 'RESERVATION_EDIT_ERROR' });
    res.status(500).send('Error updating reservation');
  }
});


// GET /reservations/seats/:flightId - Fetch seat availability for a flight
router.get("/seats/:flightId", isAuthenticated, async (req, res) => {
  try {
    const flightId = validateObjectId(req.params.flightId, 'Flight ID');
    const integrityState = await BookingIntegrityState.findById('booking-integrity-v1').lean();
    if (!integrityState?.ready || integrityState.version !== 1 ||
        integrityState.indexName !== 'unique_flight_seat') {
      return res.status(409).json({ success: false, message: 'Booking integrity setup is not complete.' });
    }
    const flight = await Flight.findById(flightId).lean();
    if (!flight) return res.status(404).json({ success: false, message: 'Flight not found.' });
    if (!flight.aircraftLayoutId) {
      return res.status(409).json({ success: false, message: 'Seat layout is not configured for this flight.' });
    }
    const layout = await AircraftLayout.findOne({
      _id: flight.aircraftLayoutId,
      active: true
    }).lean();
    if (!layout) {
      return res.status(409).json({ success: false, message: 'Seat layout is not configured for this flight.' });
    }
    const excludeReservation = req.query.excludeReservation
      ? validateObjectId(req.query.excludeReservation, 'Reservation ID')
      : null;
    const filter = { flightId };
    if (excludeReservation) filter.reservationId = { $ne: excludeReservation };
    const allocations = await SeatAllocation.find(filter).select('seatNumber').lean();
    return res.json({
      success: true,
      seats: layout.seats,
      occupiedSeats: allocations.map(allocation => allocation.seatNumber),
      seatCapacity: flight.seatCapacity,
      bookedSeats: flight.bookedSeats || 0
    });
  } catch (err) {
    if (err instanceof BookingInputError) {
      return res.status(err.statusCode).json({ success: false, message: err.message });
    }
    logger.error('Seat availability request failed.', { code: err.code || 'SEAT_AVAILABILITY_ERROR' });
    res.status(500).json({ success: false, message: 'Unable to load seat availability.' });
  }
});


//8
/* =============================
   READ - View single reservation
============================= */
router.get('/:id', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const reservationId = validateObjectId(req.params.id, 'Reservation ID');
    const reservation = await Reservation.findOne({ _id: reservationId, userId: req.session.user._id })
      .populate('flight')
      .lean();

    if (!reservation) return res.status(404).send('Reservation not found');
    reservation.passengers = reservation.passengers.map(passenger => ({
      fullName: passenger.fullName,
      ageCategory: passenger.ageCategory,
      seatNumber: passenger.seatNumber,
      returnSeatNumber: passenger.returnSeatNumber,
      meal: passenger.meal,
      baggageAllowance: passenger.baggageAllowance
    }));
    res.render('reservations/details', { title: 'Booking Details', reservation });
  } catch (err) {
    if (err instanceof BookingInputError) return res.status(err.statusCode).send(err.message);
    logger.error('Reservation details request failed.', { code: err.code || 'RESERVATION_DETAILS_ERROR' });
    res.status(500).send('Error loading reservation');
  }
});

// Update Reservation (POST)
router.post('/update/:id', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const reservationId = validateObjectId(req.params.id, 'Reservation ID');
    const reservation = await Reservation.findOne({
      _id: reservationId,
      userId: req.session.user._id
    }).select('+passengers.passportEncrypted +passengers.passportFingerprint');
    if (!reservation) {
      return res.status(404).json({ success: false, message: 'Reservation not found.' });
    }
    const passengers = validateEditBody(req.body, reservation.tripType);
    if (reservation.passengers.some((existing, index) =>
      existing.checkedIn && (
        passengers[index]?.fullName !== existing.fullName ||
        passengers[index]?.ageCategory !== existing.ageCategory ||
        passengers[index]?.gender !== existing.gender ||
        passengers[index]?.passport !== undefined
      )
    )) {
      throw new BookingInputError('Passenger identity details cannot be corrected after check-in.');
    }
    if (reservation.passengers.some(passenger =>
      !passenger.passportEncrypted?.ciphertext || !passenger.passportFingerprint
    )) {
      return res.status(409).json({
        success: false,
        message: 'Passenger passport migration must be completed before this reservation can be edited.'
      });
    }
    const updated = await updateReservation({ reservation, passengers });
    await recordAuditEvent({
      actorId: req.session.user._id,
      actorRole: req.session.user.role || 'user',
      action: 'reservation:update',
      resourceType: 'Reservation',
      resourceId: updated._id
    });
    if (!updated) {
      return res.status(404).json({ success: false, message: 'Reservation not found' });
    }
    res.json({ success: true });
  } catch (err) {
    if (err instanceof BookingInputError || err instanceof BookingConflictError) {
      return res.status(err.statusCode).json({ success: false, message: err.message });
    }
    logger.error('Reservation update failed.', { code: err.code || 'RESERVATION_UPDATE_ERROR' });
    res.status(500).json({ success: false, message: 'Unable to update reservation.' });
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