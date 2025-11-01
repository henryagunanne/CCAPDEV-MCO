// routes/admin.js
const express = require('express');
const Flight = require('../models/Flight');
const router = express.Router();

/* ===========================
   ADMIN ROUTES FOR FLIGHTS
=========================== */

// GET /admin/flights - Retrieve all flights
router.get('/flights', async (req, res) => {
    try {
        const flights = await Flight.find().lean();
        res.render('flights/list', { title: 'All Flights', flights });
        res.status(200).json(flights);
    } catch (error) {
        res.status(500).json({ message: 'Error retrieving flights', error });
    }
});

// GET /admin/flights/:flightNumber - Retrieve a specific flight by flight number
router.get('/flights/:flightNumber', async (req, res) => {
    try {
        const flight = await Flight.findOne({ flightNumber: req.params.flightNumber }).lean();
        if (flight) {
            res.render('flights/detail', { title: 'Flight Details', flight });
            res.status(200).json(flight);
        } else {
            res.status(404).json({ message: 'find Flight not found' });
        }
    } catch (error) {
        res.status(500).json({ message: 'Error retrieving flight', error });
    }
});

// POST /admin/create - Create a new flight
router.post('/create', async (req, res) => {
    try {
        const newFlight = new Flight(req.body);
        const savedFlight = await newFlight.save();
        res.status(201).json(savedFlight);
    } catch (error) {
        res.status(400).json({ message: 'Error creating flight', error });
    }
});

//  PUT /admin/update - Update an existing flight
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
            res.status(404).json({ message: 'Flight to Update not found' });
        }
    } catch (error) {
        res.status(400).json({ message: 'Error updating flight', error });
    }
});

// DELETE /admin/delete - Delete a flight
router.delete('/delete', async (req, res) => {
    try {
        const deletedFlight = await Flight.findOneAndDelete({ flightNumber: req.body.flightNumber }).lean();

        if (deletedFlight) {
            res.status(200).json({ message: 'Flight deleted successfully' });
        } else {
            res.status(404).json({ message: 'Flight to Delete not found' });
        }
    } catch (error) {
        res.status(400).json({ message: 'Error deleting flight', error });
    }
});

// Export the router
module.exports = router;
