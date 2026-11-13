const crypto = require('crypto');
const AuditLog = require('../models/AuditLog');

/** * Record an audit event in the database.
 * @param {Object} params - The parameters for the audit event.
 * @param {string|null} [params.actorId=null] - The ID of the actor performing the action.
 * @param {string} [params.actorRole='unknown'] - The role of the actor.
 * @param {string} params.action - The action being performed (required).
 * @param {string} [params.resourceType='system'] - The type of resource being acted upon.
 * @param {string|number} [params.resourceId=''] - The ID of the resource being acted upon.
 * @param {string} [params.result='SUCCESS'] - The result of the action (e.g., 'SUCCESS', 'FAILURE').
 * @param {string} [params.reason=''] - A human-readable reason for the action's result.
 * @param {string} [params.reasonCode=''] - A machine-readable code for the reason (optional).
 * @param {string} [params.correlationId=''] - A correlation ID for tracing the action (optional).
 * @param {string} [params.ipAddress=''] - The IP address of the actor (optional).
 * @returns {Promise<Object>} - A promise that resolves to the created audit log entry.
 * @throws {TypeError} - If the action is not provided or is not a string.
 */
async function recordAuditEvent({
  actorId = null,
  actorRole = 'unknown',
  action,
  resourceType = 'system',
  resourceId = '',
  result = 'SUCCESS',
  reason = '',
  reasonCode = '',
  details = null,
  correlationId = '',
  ipAddress = '',
  session = null
}) {
  if (!action || typeof action !== 'string') throw new TypeError('Audit action is required.');
  const safeReasonCode = /^[A-Z0-9_:-]{0,64}$/.test(reasonCode) ? reasonCode : '';
  const event = new AuditLog({
    actorId,
    actorRole,
    action,
    resourceType,
    resourceId: String(resourceId || ''),
    result,
    reason: typeof reason === 'string' ? reason.trim().slice(0, 500) : '',
    reasonCode: safeReasonCode,
    details,
    correlationId: correlationId || crypto.randomUUID(),
  });
  await event.save(session ? { session } : undefined);
  return event;
}

module.exports = { recordAuditEvent };
