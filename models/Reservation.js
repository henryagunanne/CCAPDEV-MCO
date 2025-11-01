// models/Reservation.js
const mongoose = require('mongoose');

// Define the schema for a Reservation
const reservationSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    flight: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Flight',
        required: true
    },
    seatNumber: {
        type: String,
        required: true
    },
    tripType: {
        enum: ['One-Way', 'Round-Trip'],
        default: 'One-Way'
    },
    travelClass: {
        type: String,
        enum: ['Economy', 'Premium Economy', 'Business', 'First'],
        default: 'Economy'
    },
    meal: {
        type: String,
        enum: ['Vegetarian', 'Non-Vegetarian', 'Vegan', 'Gluten-Free', 'None'],
        default: 'None'
    },
    passengers: {
        type: Number,
        required: true,
        min: 1
    },
    baggageAllowance: {
        type: Number,
        default: 0 // in kg
    },
    bookingDate: {
        type: Date,
        default: Date.now
    },
    status: {
        type: String,
        enum: ['Confirmed', 'Cancelled', 'Pending'],
        default: 'Pending'
    }
});

// Export the model for use in other files
module.exports = mongoose.model('Reservation', reservationSchema);