// models/popularFlight.js
const mongoose = require('mongoose');

// Define the schema for a Flight
const popularFlightSchema = new mongoose.Schema({
    flightNumber: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    origin: {
        type: String,
        required: true
    },
    destination: {
        type: String,
        required: true
    },
    startDate: {
        type: Date,
        required: true
    },
    endDate: {
        type: Date,
        required: true
    },
    price: {
        type: Number,
        required: true
    },
    tripType: {
        type: String,
        enum: ['One-way', 'Round-trip'],
        required: true
    },
    travelClass: {
        type: String,
        enum: ['Economy', 'Premium Economy', 'Business', 'First'],
        default: 'Economy'
    },
    departureDate: {
        type: Date,
        required: true
    },
    image: {
        type: String,
        required: false
    }
});

// Export the model for use in other files
module.exports = mongoose.model('PopularFlight', popularFlightSchema);