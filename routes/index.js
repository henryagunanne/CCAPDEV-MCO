const express = require('express');
const router = express.Router();
const PopularFlight = require('../models/popularFlight');

// Homepage route — loads dynamic Popular Flights
router.get('/', async (req, res) => {
  try {
    // Get all popular flights and populate full flight info
    const popularFlights = await PopularFlight.find()
      .populate('flight')  
      .lean();

    res.render('flights/search', {
      title: 'Archers Airline | Search Flights',
      popularFlights
    });
  } catch (error) {
    console.error('Error loading flights:', error);
    res.status(500).send('Server Error');
  }
});

router.get('/bookFlight', (req, res) => {
  res.redirect('/flights/search');
});

module.exports = router;
