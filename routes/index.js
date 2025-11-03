const express = require('express');
const router = express.Router();
const PopularFlight = require('../models/PopularFlight');

// Homepage = Flight Search Page
router.get('/', async (req, res) => {
  try {
    const popularFlights =  await PopularFlight.find().populate('flight').lean();

    res.render('flights/search', {
      title: 'Archers Airline | Search Flights',
      popularFlights
    });
  } catch (error) {
    console.error('❌ Error loading flights:', error);
    res.status(500).send('Server Error');
  }
});

// Export the router
module.exports = router;
