const mongoose = require('mongoose');

const passengerSchema = new mongoose.Schema({
  fullName: {
      type: String,
      required: true
  },
  age: {
      type: Number,
      required: true,
      min: 0
  },
  gender: {
      type: String,
      enum: ['Male', 'Female', 'Other'],
      required: true
  },
  passport: {
    type: String,
    required: true,
    trim: true,
    Unique: true
  },
  seatNumber: {
      type: String,
      required: true
  },
  meal: {
      type: String,
      enum: ['None', 'Vegetarian', 'Non-Vegetarian', 'Vegan', 'Gluten-Free'],
      default: 'None'
  },
  baggageAllowance: {
      type: Number,
      default: 0
  }
});

// Define the schema for a Reservation
const reservationSchema = new mongoose.Schema({
  // Link to user (optional for guests)
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  // Flight reference
  flight: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Flight',
    required: true
  },
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

  passengers: [passengerSchema],

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