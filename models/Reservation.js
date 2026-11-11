const mongoose = require('mongoose');

const passengerSchema = new mongoose.Schema({
  checkedIn: {
    type: Boolean,
    default: false
  },
  boardingPass: {
  outbound: { type:String, default:null },
  return: { type:String, default:null }
  },
  fullName: {
      type: String,
      required: true
  },
  age: {
      type: Number,
      required: true,
      min: 0,
      max: 120,
      validate: Number.isInteger
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
    unique: true,
    match: /^[A-Za-z0-9]{6,9}$/
  },
  seatNumber: {
      type: String,
      required: true,
      match: /^(?:[1-9]|[12][0-9]|30)[A-J]$/
  },
  returnSeatNumber: {
      type: String,
      default: null,
      match: /^(?:[1-9]|[12][0-9]|30)[A-J]$/
  },
  meal: {
      type: String,
      enum: ['None', 'Vegetarian', 'Non-Vegetarian', 'Vegan', 'Gluten-Free'],
      default: 'None'
  },
  baggageAllowance: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
      validate: Number.isInteger
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
  bookingReference: {
    type: String,
    required: true,
    unique: true
  },
  // Flight reference
  flight: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Flight',
      required: true
    }
  ],

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

  price: {
    type: Number,
    required: true
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
}, { optimisticConcurrency: true });

// Export the model for use in other files
module.exports = mongoose.model('Reservation', reservationSchema);