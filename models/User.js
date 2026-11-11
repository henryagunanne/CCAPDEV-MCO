// models/User.js
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const ADMIN_ROLE_NAMES = [
  'flight_operations_admin',
  'reservation_support_admin',
  'finance_admin',
  'user_access_admin',
  'security_audit_admin'
];

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
    roles: {
        type: [String],
        default: [],
        validate: {
            validator: (value) => value.every((entry) => ADMIN_ROLE_NAMES.includes(entry) || entry === 'user'),
            message: 'Unsupported administrator role assignment.'
        }
    },
    permissions: {
        type: [String],
        default: []
    },
    status: {
        type: String,
        enum: ['active', 'disabled', 'suspended'],
        default: 'active'
    },
    mfaEnabled: {
        type: Boolean,
        default: true
    },
    mfaVerified: {
        type: Boolean,
        default: true
    },
    mfaSecret: {
        type: String,
        default: ''
    },
    recoveryCodes: {
        type: [String],
        default: []
    },
    loginAttempts: {
        type: Number,
        default: 0
    },
    lockUntil: {
        type: Date,
        default: null
    },
    lastLoginAt: {
        type: Date,
        default: null
    },
    lastMfaVerifiedAt: {
        type: Date,
        default: null
    },
    stepUpVerifiedAt: {
        type: Date,
        default: null
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

userSchema.pre('save', async function (next) {
    if (!this.isModified('password')) return next();
    try {
      const salt = await bcrypt.genSalt(10);
      this.password = await bcrypt.hash(this.password, salt);
      next();
    } catch (err) {
      next(err);
    }
});

userSchema.methods.toSafeSession = function () {
    return {
        _id: this._id,
        firstName: this.firstName,
        lastName: this.lastName,
        email: this.email,
        role: this.role,
        roles: this.roles || [],
        permissions: this.permissions || [],
        status: this.status || 'active',
        mfaEnabled: Boolean(this.mfaEnabled),
        mfaVerified: Boolean(this.mfaVerified),
        isAdmin: this.role === 'Admin'
    };
};

module.exports = mongoose.model('User', userSchema);