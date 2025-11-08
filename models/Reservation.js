const mongoose = require('mongoose');

const reservationSchema = new mongoose.Schema({
  // linked user (optional)
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

  // ✅ updated passenger array (multi-passenger ready)
  passengers: [
    {
      fullName: { type: String, required: true, trim: true },
      email: { type: String, required: true, lowercase: true, trim: true },
      passport: { type: String, required: true, trim: true },
      seatNumber: { type: String },
      meal: {
        type: String,
        enum: ['None', 'Vegetarian', 'Non-Vegetarian', 'Vegan', 'Gluten-Free'],
        default: 'None'
      },
      baggageAllowance: { type: Number, default: 0 }
    }
  ],

  // ✅ optional — to quickly display seat numbers in My Reservation page
  seatNumbers: {
    type: [String],
    default: []
  },

  // ✅ store computed total cost
  totalAmount: {
    type: Number,
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
});

module.exports = mongoose.model('Reservation', reservationSchema);
