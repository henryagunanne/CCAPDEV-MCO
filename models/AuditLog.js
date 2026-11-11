const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  actorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
    index: true
  },
  actorRole: {
    type: String,
    default: 'unknown'
  },
  action: {
    type: String,
    required: true,
    index: true
  },
  resourceType: {
    type: String,
    default: 'system'
  },
  resourceId: {
    type: String,
    default: ''
  },
  result: {
    type: String,
    enum: ['SUCCESS', 'FAILURE', 'PENDING', 'REJECTED', 'EXPIRED'],
    default: 'SUCCESS'
  },
  approvalId: {
    type: String,
    default: ''
  },
  reason: {
    type: String,
    default: ''
  },
  correlationId: {
    type: String,
    default: ''
  },
  ipAddress: {
    type: String,
    default: ''
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

auditLogSchema.index({ actorId: 1, timestamp: -1 });
auditLogSchema.index({ action: 1, result: 1, timestamp: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
