const mongoose = require('mongoose');

const approvalEntrySchema = new mongoose.Schema({
  approverId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  role: {
    type: String,
    default: 'custodian'
  },
  approvedAt: {
    type: Date,
    default: Date.now
  }
}, { _id: true });

const emergencyAccessGrantSchema = new mongoose.Schema({
  requestedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  reason: {
    type: String,
    required: true
  },
  permissions: {
    type: [String],
    default: []
  },
  requiredApprovals: {
    type: Number,
    default: 2,
    min: 1
  },
  approvals: [approvalEntrySchema],
  status: {
    type: String,
    enum: ['PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'ACTIVE', 'EXPIRED', 'REVOKED'],
    default: 'PENDING_APPROVAL',
    index: true
  },
  startedAt: {
    type: Date,
    default: null
  },
  expiresAt: {
    type: Date,
    required: true,
    default: () => new Date(Date.now() + 60 * 60 * 1000)
  },
  extendable: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

module.exports = mongoose.model('EmergencyAccessGrant', emergencyAccessGrantSchema);
