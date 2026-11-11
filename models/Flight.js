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
        type: String,
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
    seatCapacity: {
        type: Number,
        required: true
    },
    bookedSeats: {
        type: Number,
        required: true,
        default: 0,
        min: 0
    },
    aircraftLayoutId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AircraftLayout',
        default: null
    },
    price: {
        type: Number,
        required: true
    },    
    status: {
        type: String,
        enum: ['Scheduled', 'On Time', 'Delayed', 'Cancelled'],
        default: 'Scheduled'
    },
    completedAt: {
        type: Date,
        default: null
    }
});

// Export the model for use in other files
module.exports = mongoose.model('Flight', flightSchema);