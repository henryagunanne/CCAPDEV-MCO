const mongoose = require('mongoose');

const approvalEntrySchema = new mongoose.Schema({
  approverId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  status: {
    type: String,
    enum: ['APPROVED', 'REJECTED'],
    required: true
  },
  comment: {
    type: String,
    default: ''
  },
  approvedAt: {
    type: Date,
    default: Date.now
  }
}, { _id: true });

const adminApprovalRequestSchema = new mongoose.Schema({
  requesterId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  action: {
    type: String,
    required: true,
    index: true
  },
  resourceType: {
    type: String,
    required: true,
    default: 'system'
  },
  resourceId: {
    type: String,
    default: ''
  },
  payload: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  totalAmount: {
    type: Number,
    default: 0
  },
  payloadHash: {
    type: String,
    required: true
  },
  requiredApprovals: {
    type: Number,
    default: 1,
    min: 1
  },
  approvals: [approvalEntrySchema],
  status: {
    type: String,
    enum: ['PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'EXECUTED', 'FAILED', 'EXPIRED', 'CANCELLED'],
    default: 'PENDING_APPROVAL',
    index: true
  },
  reason: {
    type: String,
    default: ''
  },
  expiresAt: {
    type: Date,
    required: true,
    default: () => new Date(Date.now() + 24 * 60 * 60 * 1000)
  },
  correlationId: {
    type: String,
    default: ''
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

adminApprovalRequestSchema.index({ status: 1, expiresAt: 1 });

module.exports = mongoose.model('AdminApprovalRequest', adminApprovalRequestSchema);
