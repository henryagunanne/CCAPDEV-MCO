// models/User.js
const mongoose = require('mongoose');

// Define the schema for a User
const userSchema = new mongoose.Schema({
    firstName: {
        type: String,
        required: true,
        trim: true
    },
    lastName: {
        type: String,
        required: true,
        trim: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
    },
    password: {
        type: String,
        required: true
    },
    dateOfBirth: {
        type: Date,
        required: true
    },
    role: {
        type: String,
        enum: ['Admin', 'User'],
        default: 'User'
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Export the model for use in other files
module.exports = mongoose.model('User', userSchema);