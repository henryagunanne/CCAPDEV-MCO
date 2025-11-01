// models/Flight.js
const mongoose = require('mongoose');

// Define the schema for a Flight
const flightSchema = new mongoose.Schema({
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
    departureDate: {
        type: Date,
        required: true
    },
    departureTime: {
        type: String,
        required: true
    },
    arrivalTime: {
        type: String,
        required: true
    },
    aircraft:  {
        type: String,
        required: true
    },
    travelClass: {
        type: String,
        enum: ['Economy', 'Premium Economy', 'Business', 'First'],
        default: 'Economy'
    },
    seatCapacity: {
        type: Number,
        required: true
    },
    price: {
        type: Number,
        required: true
    },    
    status: {
        type: String,
        enum: ['Scheduled', 'On Time', 'Delayed', 'Cancelled'],
        default: 'Scheduled'
    }
});

// Export the model for use in other files
module.exports = mongoose.model('Flight', flightSchema);