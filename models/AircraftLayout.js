const mongoose = require('mongoose');

const seatSchema = new mongoose.Schema({
  seatNumber: {
    type: String,
    required: true,
    match: /^(?:[1-9]|[12][0-9]|30)[A-J]$/
  },
  row: {
    type: Number,
    required: true,
    min: 1,
    max: 30
  },
  column: {
    type: String,
    required: true,
    enum: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']
  },
  position: {
    type: String,
    enum: ['WINDOW', 'MIDDLE', 'AISLE'],
    required: true
  },
  travelClass: {
    type: String,
    enum: ['Economy', 'Premium Economy', 'Business', 'First'],
    required: true
  },
  classCode: {
    type: String,
    required: true
  }
}, { _id: false });

const aircraftLayoutSchema = new mongoose.Schema({
  configurationId: {
    type: String,
    required: true,
    unique: true
  },
  aircraftType: {
    type: String,
    required: true,
    trim: true
  },
  version: {
    type: String,
    required: true
  },
  seatCapacity: {
    type: Number,
    required: true,
    min: 1,
    max: 300
  },
  seats: {
    type: [seatSchema],
    required: true,
    validate: {
      validator(seats) {
        return seats.length === this.seatCapacity &&
          new Set(seats.map(seat => seat.seatNumber)).size === seats.length;
      },
      message: 'Layout seats must be unique and match seatCapacity.'
    }
  },
  layoutMode: {
    type: String,
    enum: ['DYNAMIC_CAPACITY'],
    required: true
  },
  sourceConfigurationId: {
    type: String,
    required: true
  },
  sourceHash: {
    type: String,
    required: true
  },
  active: {
    type: Boolean,
    default: true
  }
}, { timestamps: true });

aircraftLayoutSchema.index(
  { aircraftType: 1, seatCapacity: 1, version: 1 },
  { unique: true }
);

module.exports = mongoose.model('AircraftLayout', aircraftLayoutSchema);
