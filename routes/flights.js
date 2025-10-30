// routes/flights.js
const express = require('express');
const Flight = require('../models/Flight');
const router = express.Router();


/* ===========================
   ADMIN ROUTES FOR FLIGHTS
=========================== */

// GET /flights - Retrieve all flights
router.get('/', async (req, res) => {
    try {
        const flights = await Flight.find().lean();
        res.render('flights/list', { title: 'All Flights', flights });
        res.status(200).json(flights);
    } catch (error) {
        res.status(500).json({ message: 'Error retrieving flights', error });
    }
});

// GET /flights/:flightNumber - Retrieve a specific flight by flight number
router.get('/:flightNumber', async (req, res) => {
    try {
        const flight = await Flight.findOne({ flightNumber: req.params.flightNumber }).lean();
        if (flight) {
            res.render('flights/detail', { title: 'Flight Details', flight });
            res.status(200).json(flight);
        } else {
            res.status(404).json({ message: 'Flight not found' });
        }
    } catch (error) {
        res.status(500).json({ message: 'Error retrieving flight', error });
    }
});

// POST /flights - Create a new flight
router.post('/create', async (req, res) => {
    try {
        const newFlight = new Flight(req.body).lean();
        const savedFlight = await newFlight.save();
        res.status(201).json(savedFlight);
    } catch (error) {
        res.status(400).json({ message: 'Error creating flight', error });
    }
});

//  PUT /flights/update - Update an existing flight
router.put('/update', async (req, res) => {
    try {
        const updatedFlight = await Flight.findOneAndUpdate(
            { flightNumber: req.body.flightNumber },
            req.body,
            { new: true }
        ).lean();

        if (updatedFlight) {
            res.status(200).json(updatedFlight);
        } else {
            res.status(404).json({ message: 'Flight not found' });
        }
    } catch (error) {
        res.status(400).json({ message: 'Error updating flight', error });
    }
});

// DELETE /flights/delete - Delete a flight
router.delete('/delete', async (req, res) => {
    try {
        const deletedFlight = await Flight.findOneAndDelete({ flightNumber: req.body.flightNumber }).lean();

        if (deletedFlight) {
            res.status(200).json({ message: 'Flight deleted successfully' });
        } else {
            res.status(404).json({ message: 'Flight not found' });
        }
    } catch (error) {
        res.status(400).json({ message: 'Error deleting flight', error });
    }
});



/* ===========================
   CLIENT ROUTES
=========================== */

// GET /flights/search - Search for flights by origin, destination, and date
router.get('/search', async (req, res) => {
    try {
        const { tripType, origin, destination, departureDate, returnDate } = req.query;
        const departureQuery = {};

        if (origin) departureQuery.origin = origin;
        if (destination) departureQuery.destination = destination;
        if (departureDate) {
            const depart = new Date(departureDate);
            const nextDep = new Date(departureDate);
            nextDep.setDate(nextDep.getDate() + 1);
            departureQuery.departureTime = { $gte: depart, $lt: nextDep };
        }

        // Get outbound flights
        const outboundFlights = await Flight.find(departureQuery).lean();

        let returnFlights = [];

        // If round trip, also search for return flights
        if (tripType && tripType.toLowerCase() === 'roundtrip' && returnDate) {
            const returnQuery = {
                origin: destination,
                destination: origin
            };

            const ret = new Date(returnDate);
            const nextRet = new Date(ret);
            nextRet.setDate(ret.getDate() + 1);
            returnQuery.departureTime = { $gte: ret, $lt: nextRet };

            returnFlights = await Flight.find(returnQuery).lean();
        }

        // Render both sets of flights
        res.render('flights/searchResults', { 
            title: 'Flight Search Results', 
            outboundFlights, 
            returnFlights 
        });

        const flights = {
            outbound: outboundFlights,
            return: returnFlights
        };

        if (flights.outbound.length === 0 && flights.return.length === 0) {
            return res.status(404).json({ message: 'No flights found for the given criteria' });   
        }

        res.status(200).json(flights);
    } catch (error) {
        res.status(500).json({ message: 'Error searching for flights', error });
    }
});


// Export the router
module.exports = router;

