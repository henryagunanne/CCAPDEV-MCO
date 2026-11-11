/** * BookingIntegrityState model for MongoDB using Mongoose.
 * This model represents the integrity state of booking data, including versioning and verification status.
 */
const mongoose = require('mongoose');

const bookingIntegrityStateSchema = new mongoose.Schema({
  _id: {
    type: String,
    default: 'booking-integrity-v1'
  },
  version: {
    type: Number,
    required: true
  },
  ready: {
    type: Boolean,
    required: true,
    default: false
  },
  indexName: {
    type: String,
    required: true
  },
  verifiedAt: {
    type: Date,
    required: true
  }
}, { versionKey: false });

module.exports = mongoose.model('BookingIntegrityState', bookingIntegrityStateSchema);
