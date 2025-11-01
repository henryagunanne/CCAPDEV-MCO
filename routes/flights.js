// routes/flights.js
const express = require('express');
const Flight = require('../models/Flight');
const router = express.Router();


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
        if (departureDate) departureQuery.departureDate = departureDate;

        // Get outbound flights
        const outboundFlights = await Flight.find(departureQuery).lean();

        let returnFlights = [];

        // If round trip, also search for return flights
        if (tripType && tripType.toLowerCase() === 'round-trip' && returnDate) {
            const returnQuery = {
                origin: destination,
                destination: origin,
                departureDate: returnDate
            };

            returnFlights = await Flight.find(returnQuery).lean();
        }

        // If no flights found, show message in UI
        if (outboundFlights.length === 0 && returnFlights.length === 0) {
            if (req.xhr) {
                return res.status(404).json({ message: 'No flights found for the given criteria' });
            } else {
                return res.render('flights/searchResults', {
                    title: 'Flight Search Results',
                    noResults: true,
                    tripType,
                    origin,
                    destination
                });
            }
        }
        
        /*
       // If request is AJAX, render only the partial (no layout)
        if (req.xhr) {
            res.render('flights/searchResults', { 
            layout: false,
            outboundFlights,
            returnFlights,
            tripType
            });
        } else {
            // Regular request (user visited /flights/search manually)
            res.render('flights/searchResults', { 
            title: 'Flight Search Results', 
            outboundFlights,
            returnFlights,
            tripType
            });
        }
  
        */

        // Render or return JSON depending on request type
        if (req.xhr) {
            return res.status(200).json({ outboundFlights, returnFlights });
        } else {
            return res.render('flights/searchResults', {
                title: 'Flight Search Results',
                outboundFlights,
                returnFlights,
                tripType
            });
        }
    } catch (error) {
        res.status(500).json({ message: 'Error searching for flights', error });
    }
});



// Export the router
module.exports = router;

