// models/User.js
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const BCRYPT_HASH_PATTERN = /^\$2[aby]\$\d{2}\$/;

const ADMIN_ROLE_NAMES = [
  'flight_operations_admin',
  'reservation_support_admin',
  'finance_admin',
  'user_access_admin',
  'security_audit_admin',
  'data_protection_officer'
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
        required: true,
        minlength: [8, 'Password must be at least 8 characters long.']
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
    if (typeof this.password !== 'string' || this.password.trim() === '') {
      return next(new Error('Password is required.'));
    }
    if (BCRYPT_HASH_PATTERN.test(this.password)) {
      return next();
    }
    try {
      const salt = await bcrypt.genSalt(12);
      this.password = await bcrypt.hash(this.password, salt);
      next();
    } catch (err) {
      next(err);
    }
});

userSchema.methods.comparePassword = async function (candidatePassword) {
    return bcrypt.compare(candidatePassword, this.password);
};

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