const mongoose = require('mongoose');

const privacyRequestSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['access', 'correction', 'deletion', 'consent-withdrawal'],
    required: true
  },
  subjectType: {
    type: String,
    enum: ['account-holder', 'co-passenger'],
    required: true
  },
  requesterId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  reservationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Reservation', default: null },
  passengerId: { type: mongoose.Schema.Types.ObjectId, default: null },
  receivedAt: { type: Date, required: true },
  acknowledgementDueAt: { type: Date, required: true },
  completionDueAt: { type: Date, required: true },
  acknowledgementCalendarVersions: { type: [String], required: true },
  completionCalendarVersions: { type: [String], required: true },
  acknowledgedAt: { type: Date, default: null },
  completedAt: { type: Date, default: null },
  status: {
    type: String,
    enum: ['RECEIVED', 'ACKNOWLEDGED', 'IN_PROGRESS', 'COMPLETED', 'REFUSED'],
    default: 'RECEIVED',
    index: true
  },
  decisionCode: { type: String, default: '' },
  clarificationRequestedAt: { type: Date, default: null },
  deadlineChanges: [{
    changedAt: { type: Date, required: true },
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    reason: { type: String, required: true },
    previousAcknowledgementDueAt: { type: Date, required: true },
    newAcknowledgementDueAt: { type: Date, required: true },
    previousCompletionDueAt: { type: Date, required: true },
    newCompletionDueAt: { type: Date, required: true },
    calendarVersions: { type: [String], required: true }
  }]
}, { timestamps: true, optimisticConcurrency: true });

privacyRequestSchema.index({ status: 1, completionDueAt: 1 });

module.exports = mongoose.model('PrivacyRequest', privacyRequestSchema);
