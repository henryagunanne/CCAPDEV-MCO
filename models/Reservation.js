const mongoose = require('mongoose');

// --- Passenger Subschema ---
const passengerSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    passport: { type: String, required: true, trim: true },
    seatNumber: { type: String, required: true, trim: true },
    meal: {
      type: String,
      enum: ['None', 'Vegetarian', 'Non-Vegetarian', 'Vegan', 'Gluten-Free'],
      default: 'None'
    },
    baggageAllowance: { type: Number, default: 0 }
  },
  {
    _id: false,     // prevents subdocuments from creating their own _id
    strict: true    // ensures only defined fields are stored
  }
);

// --- Main Reservation Schema ---
const reservationSchema = new mongoose.Schema(
  {
    // linked user (optional)
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: false
    },

    // linked flight
    flight: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Flight',
      required: true
    },

    // trip details
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

    // ✅ passengers array using sub-schema
    passengers: {
      type: [passengerSchema],
      default: [],
      required: true
    },

    // ✅ computed list of seat numbers for quick filtering
    seatNumbers: {
      type: [String],
      default: []
    },

    // ✅ total computed fare
    totalAmount: {
      type: Number,
      required: true,
      default: 0
    },

    bookingDate: {
      type: Date,
      default: Date.now
    },
    status: {
      type: String,
      enum: ['Confirmed', 'Cancelled', 'Pending'],
      default: 'Confirmed'
    }
  },
  { timestamps: true } // optional createdAt / updatedAt
);

module.exports = mongoose.model('Reservation', reservationSchema);
