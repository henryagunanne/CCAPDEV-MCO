const mongoose = require('mongoose');

const seatAllocationSchema = new mongoose.Schema({
  flightId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Flight',
    required: true
  },
  seatNumber: {
    type: String,
    required: true,
    match: /^(?:[1-9]|[12][0-9]|30)[A-J]$/
  },
  reservationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Reservation',
    required: true
  },
  passengerIndex: {
    type: Number,
    required: true,
    min: 0
  },
  attemptId: {
    type: String,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, { versionKey: false });

seatAllocationSchema.index(
  { flightId: 1, seatNumber: 1 },
  { unique: true, name: 'unique_flight_seat' }
);
seatAllocationSchema.index({ reservationId: 1 });

module.exports = mongoose.model('SeatAllocation', seatAllocationSchema);