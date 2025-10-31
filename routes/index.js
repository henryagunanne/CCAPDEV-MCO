const express = require('express');
const router = express.Router();
const PopularFlight = require('../models/popularFlight');

// Homepage = Flight Search Page
router.get('/', async (req, res) => {
  try {
    const popularFlights = await PopularFlight.find()
      .sort({ price: 1 })
      .lean();

    res.render('flights/search', {
      title: 'Archers Airline | Book Flights',
      popularFlights
    });
  } catch (error) {
    res.status(500).send('Server Error');
  }
});

module.exports = router;
