const mongoose = require('mongoose');

const seatSchema = new mongoose.Schema({
    seatNumber: {
        type: String,
        required: true
    }, // e.g. "12A"
    class: { 
        type: String, 
        enum: ['First', 'Business', 'Economy','Premium Economy'], 
        default: 'Economy' 
    },
    occupied: { 
        type: Boolean, 
        default: false 
    }
});

