/**
 * This script migrates legacy passenger data to a more privacy-conscious format.
 * It encrypts plaintext passport numbers, replaces exact ages with age categories,
 * and removes unsupported meal preferences without consent.
 *
 * Usage:
 *   node migrate-privacy-data.js [--apply] [--confirm=APPLY-PRIVACY-MIGRATION]
 *
 * Options:
 *   --apply: Apply the migration changes to the database. Without this flag, the script runs in dry-run mode.
 *   --confirm=APPLY-PRIVACY-MIGRATION: Required when using --apply to confirm that you understand the implications of applying the migration.
 *
 * The script will output a JSON object summarizing the counts of affected records and any issues found during inspection.
 */ 

const mongoose = require('mongoose');
const User = require('../models/User');
const Reservation = require('../models/Reservation');
const { encryptPassport, fingerprintPassport } = require('../services/passportEncryption');
const { mongoUri } = require('../config/env');

function ageCategory(age) {
  if (!Number.isInteger(age) || age < 0 || age > 120) {
    throw new Error('Legacy passenger age is invalid; migration stopped without applying changes.');
  }
  if (age < 2) return 'Infant under 2';
  if (age < 12) return 'Child 2–11';
  return 'Adult 12+';
}

async function inspect() {
  const [accountsWithDob, reservations] = await Promise.all([
    User.countDocuments({ dateOfBirth: { $exists: true } }),
    Reservation.collection.find({}, {
      projection: { passengers: 1 }
    }).toArray()
  ]);
  const counts = {
    accountsWithDob,
    reservationsToInspect: 0,
    plaintextPassports: 0,
    exactAges: 0,
    unsupportedMealsWithoutConsent: 0,
    invalidPlaintextPassports: 0,
    invalidExactAges: 0,
    duplicatePassportFingerprints: 0
  };
  const seenFingerprints = new Set();
  for (const reservation of reservations) {
    let needsUpdate = false;
    for (const passenger of reservation.passengers || []) {
      if (typeof passenger.passport === 'string') {
        counts.plaintextPassports += 1;
        needsUpdate = true;
        const normalized = passenger.passport.trim().toUpperCase();
        if (!/^[A-Z0-9]{6,9}$/.test(normalized)) {
          counts.invalidPlaintextPassports += 1;
        } else {
          const fingerprint = fingerprintPassport(normalized);
          if (seenFingerprints.has(fingerprint)) counts.duplicatePassportFingerprints += 1;
          seenFingerprints.add(fingerprint);
        }
      } else if (typeof passenger.passportFingerprint === 'string') {
        if (seenFingerprints.has(passenger.passportFingerprint)) {
          counts.duplicatePassportFingerprints += 1;
        }
        seenFingerprints.add(passenger.passportFingerprint);
      }
      if (passenger.age !== undefined) {
        needsUpdate = true;
        if (Number.isInteger(passenger.age) && passenger.age >= 0 && passenger.age <= 120) {
          counts.exactAges += 1;
        } else {
          counts.invalidExactAges += 1;
        }
      }
      if (passenger.meal && passenger.meal !== 'None' && passenger.mealConsent?.granted !== true) {
        counts.unsupportedMealsWithoutConsent += 1;
        needsUpdate = true;
      }
    }
    if (needsUpdate) counts.reservationsToInspect += 1;
  }
  return { counts, reservations };
}

async function migrate() {
  const { counts, reservations } = await inspect();
  if (counts.invalidPlaintextPassports || counts.invalidExactAges ||
      counts.duplicatePassportFingerprints) {
    throw new Error('Migration preflight found invalid or duplicate passenger data; no writes were applied.');
  }
  for (const reservation of reservations) {
    const set = {};
    const unset = {};
    for (let index = 0; index < (reservation.passengers || []).length; index += 1) {
      const passenger = reservation.passengers[index];
      if (typeof passenger.passport === 'string') {
        const normalized = passenger.passport.trim().toUpperCase();
        const encrypted = encryptPassport(normalized);
        for (const [key, value] of Object.entries(encrypted)) {
          set[`passengers.${index}.passportEncrypted.${key}`] = value;
        }
        set[`passengers.${index}.passportFingerprint`] = fingerprintPassport(normalized);
        set[`passengers.${index}.passportLast3`] = normalized.slice(-3);
        unset[`passengers.${index}.passport`] = '';
      }
      if (Number.isInteger(passenger.age)) {
        set[`passengers.${index}.ageCategory`] = ageCategory(passenger.age);
        unset[`passengers.${index}.age`] = '';
      }
      if (passenger.meal && passenger.meal !== 'None' && passenger.mealConsent?.granted !== true) {
        set[`passengers.${index}.meal`] = 'None';
      }
    }
    if (Object.keys(set).length || Object.keys(unset).length) {
      await Reservation.collection.updateOne(
        { _id: reservation._id },
        {
          ...(Object.keys(set).length ? { $set: set } : {}),
          ...(Object.keys(unset).length ? { $unset: unset } : {})
        }
      );
    }
  }
  await User.collection.updateMany(
    { dateOfBirth: { $exists: true } },
    { $unset: { dateOfBirth: '' } }
  );
  const indexes = await Reservation.collection.indexes();
  const legacyIndex = indexes.find(index =>
    index.name === 'passengers.passport_1' || index.key?.['passengers.passport']
  );
  if (legacyIndex) await Reservation.collection.dropIndex(legacyIndex.name);
  const fingerprintIndex = indexes.find(index => index.key?.['passengers.passportFingerprint']);
  if (!fingerprintIndex) {
    await Reservation.collection.createIndex(
      { 'passengers.passportFingerprint': 1 },
      { unique: true, sparse: true, name: 'unique_passenger_passport_fingerprint' }
    );
  } else if (!fingerprintIndex.unique || !fingerprintIndex.sparse) {
    await Reservation.collection.dropIndex(fingerprintIndex.name);
    await Reservation.collection.createIndex(
      { 'passengers.passportFingerprint': 1 },
      { unique: true, sparse: true, name: 'unique_passenger_passport_fingerprint' }
    );
  }
  return counts;
}

async function main() {
  const apply = process.argv.includes('--apply');
  if (apply && !process.argv.includes('--confirm=APPLY-PRIVACY-MIGRATION')) {
    throw new Error('Apply mode requires --confirm=APPLY-PRIVACY-MIGRATION.');
  }
  await mongoose.connect(mongoUri);
  try {
    if (!apply) {
      const { counts } = await inspect();
      process.stdout.write(`${JSON.stringify({ mode: 'dry-run', counts }, null, 2)}\n`);
      return;
    }
    const counts = await migrate();
    process.stdout.write(`${JSON.stringify({ mode: 'applied', counts }, null, 2)}\n`);
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error('Privacy migration failed.', error.code || error.name);
    process.exitCode = 1;
  });
}

module.exports = { ageCategory, inspect };
