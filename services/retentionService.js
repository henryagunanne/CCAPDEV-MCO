const Reservation = require('../models/Reservation');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');

const DAY_MS = 24 * 60 * 60 * 1000;
const RETENTION = Object.freeze({
  passengerSensitiveMs: 30 * DAY_MS,
  passengerIdentityMonths: 12,
  accountInactiveMonths: 24,
  auditMonths: 12,
  transactionYears: 5
});


/** * Subtract a specified number of calendar months from a given date, adjusting for month length.
 * @param {Date} date - The original date.
 * @param {number} months - The number of months to subtract.
 * @returns {Date} - A new Date object with the adjusted date.
 */
function subtractCalendarMonths(date, months) {
  const result = new Date(date);
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() - months);
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}


/** * Subtract a specified number of calendar years from a given date, adjusting for leap years.
 * @param {Date} date - The original date.
 * @param {number} years - The number of years to subtract.
 * @returns {Date} - A new Date object with the adjusted date.
 */
function subtractCalendarYears(date, years) {
  const result = new Date(date);
  const month = result.getUTCMonth();
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCFullYear(result.getUTCFullYear() - years);
  result.setUTCMonth(month);
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), month + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}


/** * Find reservations that require passenger data updates based on retention policies.
 * @param {Date} now - The current date and time.
 * @returns {Promise<Array>} - A promise that resolves to an array of actions for updating reservations.
 */
async function findReservationActions(now) {
  const reservations = await Reservation.find()
    .select('+passengers.age +passengers.passport +passengers.passportEncrypted')
    .populate({ path: 'flight', select: 'completedAt' })
    .lean();
  const actions = [];
  for (const reservation of reservations) {
    const completionTimes = (reservation.flight || []).map(flight => flight?.completedAt);
    if (!completionTimes.length || completionTimes.some(value => !value)) continue;
    const lastFlightAt = new Date(Math.max(...completionTimes.map(value => new Date(value).getTime())));
    if (Number.isNaN(lastFlightAt.getTime())) continue;
    const sensitiveExpired = lastFlightAt <= new Date(now.getTime() - RETENTION.passengerSensitiveMs);
    const identityExpired = lastFlightAt <= subtractCalendarMonths(now, RETENTION.passengerIdentityMonths);
    const travelComplete = lastFlightAt <= now;
    const passengerUpdates = [];
    const reservationUpdate = { $unset: {} };
    if (travelComplete) {
      for (const field of ['tripType', 'travelClass']) {
        if (reservation[field] !== undefined) reservationUpdate.$unset[field] = '';
      }
    }
    if (sensitiveExpired || identityExpired || travelComplete) {
      for (const [index, passenger] of (reservation.passengers || []).entries()) {
        const update = { $unset: {}, $set: {} };
        if (sensitiveExpired) {
          for (const field of [
            'age', 'ageCategory', 'passport', 'passportEncrypted',
            'passportFingerprint', 'passportLast3', 'mealConsent'
          ]) {
            if (passenger[field] !== undefined) update.$unset[`passengers.$[passenger].${field}`] = '';
          }
          if (passenger.meal && passenger.meal !== 'None') {
            update.$set['passengers.$[passenger].meal'] = 'None';
          }
        }
        if (identityExpired) {
          const anonymousName = `Passenger ${index + 1}`;
          if (passenger.fullName !== anonymousName) {
            update.$set['passengers.$[passenger].fullName'] = anonymousName;
          }
          for (const field of [
            'gender', 'seatNumber', 'returnSeatNumber', 'baggageAllowance'
          ]) {
            if (passenger[field] !== undefined) update.$unset[`passengers.$[passenger].${field}`] = '';
          }
        }
        if (travelComplete) {
          if (passenger.checkedIn) update.$set['passengers.$[passenger].checkedIn'] = false;
          if (passenger.boardingPass?.outbound || passenger.boardingPass?.return) {
            update.$set['passengers.$[passenger].boardingPass'] = null;
          }
        }
        if (!Object.keys(update.$set).length) delete update.$set;
        if (!Object.keys(update.$unset).length) delete update.$unset;
        if (Object.keys(update).length) {
          passengerUpdates.push({ passengerId: passenger._id, update });
        }
      }
    }
    if (Object.keys(reservationUpdate.$unset).length) {
      actions.push({
        reservationId: reservation._id,
        passengerUpdates,
        reservationUpdate
      });
    } else if (passengerUpdates.length) {
      actions.push({ reservationId: reservation._id, passengerUpdates, reservationUpdate: null });
    }
  }
  return actions;
}


/** * Run the retention process to clean up old user accounts, reservations, and audit logs.
 * @param {Object} options - Options for the retention run.
 * @param {Date} [options.now=new Date()] - The current date and time for the retention run.
 * @param {boolean} [options.apply=false] - Whether to apply the changes or just perform a dry run.
 * @returns {Promise<Object>} - A promise that resolves to a report of the retention run.
 * @throws {TypeError} - If the provided date is invalid.
 */
async function runRetention({ now = new Date(), apply = false } = {}) {
  const timestamp = new Date(now);
  if (Number.isNaN(timestamp.getTime())) throw new TypeError('Retention run time is invalid.');

  const accountCutoff = subtractCalendarMonths(timestamp, RETENTION.accountInactiveMonths);
  const auditCutoff = subtractCalendarMonths(timestamp, RETENTION.auditMonths);
  const transactionCutoff = subtractCalendarYears(timestamp, RETENTION.transactionYears);
  const userFilter = {
    $and: [
      { status: { $nin: ['disabled', 'deleted'] } },
      { $or: [
        { lastLoginAt: { $lt: accountCutoff } },
        { lastLoginAt: null, createdAt: { $lt: accountCutoff } }
      ] }
    ]
  };
  const oldUsers = await User.find(userFilter).select('_id').lean();
  const passengerActions = await findReservationActions(timestamp);
  const oldAuditCount = await AuditLog.countDocuments({ timestamp: { $lt: auditCutoff } });
  const oldTransactionCount = await Reservation.countDocuments({ bookingDate: { $lt: transactionCutoff } });
  const report = {
    mode: apply ? 'apply' : 'dry-run',
    evaluatedAt: timestamp.toISOString(),
    eligibleInactiveAccounts: oldUsers.length,
    passengerReservationsToUpdate: passengerActions.filter(action =>
      action.passengerUpdates.length
    ).length,
    passengerRecordsToUpdate: passengerActions.reduce(
      (count, action) => count + action.passengerUpdates.length, 0
    ),
    reservationsToFinalizeOperations: passengerActions.filter(action => action.reservationUpdate).length,
    auditRecordsToDelete: oldAuditCount,
    transactionRecordsToDelete: oldTransactionCount
  };
  if (!apply) return report;

  for (const action of passengerActions) {
    if (action.reservationUpdate) {
      await Reservation.updateOne(
        { _id: action.reservationId },
        action.reservationUpdate
      );
    }
    for (const { passengerId, update } of action.passengerUpdates) {
      if (!Object.keys(update).length) continue;
      await Reservation.updateOne(
        { _id: action.reservationId },
        update,
        { arrayFilters: [{ 'passenger._id': passengerId }] }
      );
    }
  }
  for (const user of oldUsers) {
    await Reservation.updateMany(
      { userId: user._id },
      { $set: { userId: null, accountDeletedAt: timestamp, privacyNoticeAcceptedBy: null } }
    );
    await User.deleteOne({ _id: user._id });
  }
  const deletedAudit = await AuditLog.deleteMany({ timestamp: { $lt: auditCutoff } });
  const deletedTransactions = await Reservation.deleteMany({ bookingDate: { $lt: transactionCutoff } });
  return {
    ...report,
    deletedAuditRecords: deletedAudit.deletedCount,
    deletedTransactionRecords: deletedTransactions.deletedCount
  };
}

module.exports = {
  RETENTION,
  subtractCalendarMonths,
  subtractCalendarYears,
  findReservationActions,
  runRetention
};
