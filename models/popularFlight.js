// models/popularFlight.js
const mongoose = require('mongoose');

// Define the schema for a Flight
const popularFlightSchema = new mongoose.Schema({
    flight: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Flight',
        required: true
    },
    startDate: {
        type: Date,
        required: true
    },
    endDate: {
        type: Date,
        required: true
    },
    travelClass: {
        type: String,
        enum: ['Economy', 'Premium Economy', 'Business', 'First'],
        default: 'Economy'
    },
    tripType: {
        type: String,
        enum: ['One-Way', 'Round-Trip'],
        required: true
    },
    image: {
        type: String,
        required: false
    }
});

// Export the model for use in other files
module.exports = mongoose.model('PopularFlight', popularFlightSchema);