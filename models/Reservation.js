const mongoose = require('mongoose');

// Define the schema for a Reservation
const reservationSchema = new mongoose.Schema({
  // Link to user (optional for guests)
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false
  },

  // Passenger info
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

  // Flight reference
  flight: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Flight',
    required: true
  },

  // Booking details
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
  seatNumber: {
    type: String,
    required: true
  },

  // Add-ons
  meal: {
    type: String,
    enum: ['None', 'Vegetarian', 'Non-Vegetarian', 'Vegan', 'Gluten-Free'],
    default: 'None'
  },
  baggageAllowance: {
    type: Number,
    default: 0
  },

  // System-generated
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