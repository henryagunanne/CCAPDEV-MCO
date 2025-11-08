// models/Reservation.js
const mongoose = require('mongoose');

const reservationSchema = new mongoose.Schema({
  // optional: sino yung naka-login
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false
  },

  // flight reference
  flight: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Flight',
    required: true
  },

  // basic booking details
  tripType: {
    type: String,
    enum: ['One-Way', 'Round-Trip'],
    default: 'One-Way'
  },
  travelClass: {
    type: String,
    enum: ['Economy', 'Premium Economy', 'Business', 'First'],
    default: 'Economy'
  },

  // passenger info (ONE passenger per reservation)
  fullName: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true
  },
  passport: {
    type: String,
    required: true,
    trim: true
  },
  seatNumber: {
    type: String,
    required: true
  },

  // add–ons
  meal: {
    type: String,
    enum: ['None', 'Vegetarian', 'Non-Vegetarian', 'Vegan', 'Gluten-Free'],
    default: 'None'
  },
  baggageAllowance: {
    type: Number,
    default: 0 // in kg
  },

  // system fields
  bookingDate: {
    type: Date,
    default: Date.now
  },
  status: {
    type: String,
    enum: ['Confirmed', 'Cancelled', 'Pending'],
    default: 'Confirmed'
  }
});

module.exports = mongoose.model('Reservation', reservationSchema);
