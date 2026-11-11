const mongoose = require('mongoose');

const encryptedPassportSchema = new mongoose.Schema({
  algorithm: { type: String, enum: ['aes-256-gcm'] },
  version: { type: Number, enum: [1] },
  iv: { type: String },
  authTag: { type: String },
  ciphertext: { type: String }
}, { _id: false });

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
  ageCategory: {
    type: String,
    enum: ['Adult 12+', 'Child 2–11', 'Infant under 2'],
    default: undefined
  },
  age: {
    type: Number,
    min: 0,
    max: 120,
    validate: Number.isInteger,
    select: false
  },
  gender: {
      type: String,
      enum: ['Male', 'Female', 'Other'],
  },
  passport: {
    type: String,
    trim: true,
    select: false,
    match: /^[A-Za-z0-9]{6,9}$/
  },
  passportEncrypted: { type: encryptedPassportSchema, select: false },
  passportFingerprint: {
    type: String,
    select: false
  },
  passportLast3: {
    type: String,
    default: ''
  },
  seatNumber: {
      type: String,
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
  mealConsent: {
    granted: { type: Boolean, default: false },
    version: { type: String, default: '' },
    consentedAt: { type: Date, default: null },
    withdrawnAt: { type: Date, default: null }
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
    default: null
  },
  accountDeletedAt: { type: Date, default: null },
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
  },
  privacyNoticeVersion: { type: String, default: '' },
  privacyNoticeAcceptedAt: { type: Date, default: null },
  privacyNoticeAcceptedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { optimisticConcurrency: true });

passengerSchema.index({ passportFingerprint: 1 }, { unique: true, sparse: true });

// Export the model for use in other files
module.exports = mongoose.model('Reservation', reservationSchema);