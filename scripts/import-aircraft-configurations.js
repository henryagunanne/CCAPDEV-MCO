#!/usr/bin/env node

/**
 * This script imports aircraft configurations from a JSON file and assigns them to flights in the database.
 * It can be run in dry-run mode or apply mode.
 * Usage:
 *   node import-aircraft-configurations.js [--apply]
 *
 * Options:
 *   --apply: Apply the import changes to the database.
 */

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const mongoose = require('mongoose');
const { mongoUri } = require('../config/env');
const Flight = require('../models/Flight');
const AircraftLayout = require('../models/AircraftLayout');
const BookingIntegrityState = require('../models/BookingIntegrityState');

const inputPath = path.resolve(
  process.cwd(),
  process.env.AIRCRAFT_CONFIG_INPUT || './config/aircraft-configurations.json'
);
const apply = process.argv.includes('--apply');

function normalizedConfiguration(assignment) {
  const seats = assignment.seats.map(seat => ({
    seatNumber: seat.seatNumber,
    row: seat.row,
    column: seat.column,
    position: seat.position,
    travelClass: seat.travelClass,
    classCode: seat.classCode
  }));
  const seatCapacity = assignment.declaredCapacity;
  const configurationId = `${assignment.configurationId}-C${seatCapacity}`;
  const sourceHash = crypto.createHash('sha256').update(JSON.stringify(seats)).digest('hex');
  return {
    configurationId,
    aircraftType: assignment.aircraft,
    version: assignment.configurationVersion,
    seatCapacity,
    seats,
    layoutMode: assignment.layoutMode,
    sourceConfigurationId: assignment.configurationId,
    sourceHash
  };
}

async function readAssignments() {
  if (!fs.existsSync(inputPath)) throw new Error(`Configuration file not found: ${inputPath}`);
  const input = fs.createReadStream(inputPath, { encoding: 'utf8' });
  const lines = readline.createInterface({ input, crlfDelay: Infinity });
  const assignments = new Map();
  let readingAssignments = false;
  let assignmentCount = 0;

  for await (const line of lines) {
    const text = line.trim();
    if (text === '"flightAssignments": [') {
      readingAssignments = true;
      continue;
    }
    if (!readingAssignments) continue;
    if (text === '],') break;
    if (!text.startsWith('{"flightId"')) continue;
    const assignment = JSON.parse(text.replace(/,$/, ''));
    assignmentCount += 1;
    if (!Array.isArray(assignment.seats) ||
        assignment.generatedSeatCount !== assignment.declaredCapacity ||
        assignment.seats.length !== assignment.declaredCapacity) {
      throw new Error(`Seat count does not reconcile for flight ${assignment.flightNumber}.`);
    }
    const seenSeats = new Set();
    for (const seat of assignment.seats) {
      if (!/^(?:[1-9]|[12][0-9]|30)[A-J]$/.test(seat.seatNumber) ||
          seenSeats.has(seat.seatNumber)) {
        throw new Error(`Invalid or duplicate seat in flight ${assignment.flightNumber}.`);
      }
      seenSeats.add(seat.seatNumber);
    }
    const layout = normalizedConfiguration(assignment);
    const existing = assignments.get(layout.configurationId);
    if (existing && existing.sourceHash !== layout.sourceHash) {
      throw new Error(`Conflicting layout data for ${layout.configurationId}.`);
    }
    assignments.set(layout.configurationId, layout);
  }
  if (!readingAssignments || assignmentCount === 0) {
    throw new Error('No compact flightAssignments were found in the configuration file.');
  }
  return { assignments: [...assignments.values()], assignmentCount };
}

async function main() {
  const { assignments, assignmentCount } = await readAssignments();
  await mongoose.connect(mongoUri);
  try {
    const flights = await Flight.find({})
      .select('_id flightNumber aircraft seatCapacity')
      .lean();
    const byId = new Map(flights.map(flight => [String(flight._id), flight]));
    const existingLayouts = await AircraftLayout.find({
      configurationId: { $in: assignments.map(layout => layout.configurationId) }
    }).select('_id configurationId sourceHash').lean();
    const layoutByConfiguration = new Map(
      existingLayouts.map(layout => [layout.configurationId, layout])
    );
    const configurationLines = [];
    const updatePlans = [];
    const seenFlightIds = new Set();
    const assignmentStream = fs.createReadStream(inputPath, { encoding: 'utf8' });
    const lines = readline.createInterface({ input: assignmentStream, crlfDelay: Infinity });
    let readingAssignments = false;

    for await (const line of lines) {
      const text = line.trim();
      if (text === '"flightAssignments": [') {
        readingAssignments = true;
        continue;
      }
      if (readingAssignments && text === '],') break;
      if (!readingAssignments || !text.startsWith('{"flightId"')) continue;
      const assignment = JSON.parse(text.replace(/,$/, ''));
      const flight = byId.get(assignment.flightId);
      if (seenFlightIds.has(assignment.flightId)) {
        configurationLines.push(`DUPLICATE_FLIGHT_ASSIGNMENT ${assignment.flightId}`);
        continue;
      }
      seenFlightIds.add(assignment.flightId);
      if (!flight || flight.flightNumber !== assignment.flightNumber ||
          flight.aircraft !== assignment.aircraft ||
          flight.seatCapacity !== assignment.declaredCapacity) {
        configurationLines.push(`FLIGHT_MISMATCH ${assignment.flightNumber} (${assignment.flightId})`);
        continue;
      }
      const layout = normalizedConfiguration(assignment);
      const existing = layoutByConfiguration.get(layout.configurationId);
      if (existing && existing.sourceHash !== layout.sourceHash) {
        configurationLines.push(`IMMUTABLE_LAYOUT_CONFLICT ${layout.configurationId}`);
        continue;
      }
      if (!layoutByConfiguration.has(layout.configurationId)) {
        layoutByConfiguration.set(layout.configurationId, null);
      }
      updatePlans.push({ flightId: flight._id, configurationId: layout.configurationId });
    }

    if (assignmentCount !== flights.length) {
      configurationLines.push(`FLIGHT_COUNT_MISMATCH file=${assignmentCount} database=${flights.length}`);
    }
    if (configurationLines.length) {
      console.error(configurationLines.join('\n'));
      throw new Error('Preflight failed; no layout or flight documents were changed.');
    }

    console.log(`Flights checked: ${flights.length}`);
    console.log(`Unique aircraft/capacity layouts: ${assignments.length}`);
    console.log(`Seat assignments checked: ${assignmentCount}`);
    console.log(`Mode: ${apply ? 'APPLY' : 'DRY RUN (no database changes)'}`);
    if (!apply) return;

    await BookingIntegrityState.updateOne(
      { _id: 'booking-integrity-v1' },
      { $set: { ready: false } }
    );
    for (const layout of assignments) {
      let existing = layoutByConfiguration.get(layout.configurationId);
      if (!existing) {
        existing = await AircraftLayout.create(layout);
        layoutByConfiguration.set(layout.configurationId, existing);
      }
    }
    for (const plan of updatePlans) {
      const layoutId = layoutByConfiguration.get(plan.configurationId)._id;
      const result = await Flight.updateOne(
        { _id: plan.flightId },
        { $set: { aircraftLayoutId: layoutId } }
      );
      if (result.matchedCount !== 1) {
        throw new Error(`Flight assignment changed during import: ${plan.flightId}. Rerun after reviewing database state.`);
      }
    }
    console.log('Aircraft layouts imported and flight references assigned.');
  } finally {
    await mongoose.disconnect();
  }
}

main().catch(error => {
  console.error(`Aircraft layout import failed: ${error.message}`);
  process.exitCode = 1;
});
