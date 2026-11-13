#!/usr/bin/env node
"use strict";

/**
 * Builds config/aircraft-configurations.json from the live MongoDB Flight collection.
 *
 * Usage (project root):
 *   MONGODB_URI="mongodb://..." node scripts/generate-aircraft-configurations.js
 *
 * Optional env vars:
 *   AIRCRAFT_CONFIG_OUTPUT=config/aircraft-configurations.json
 *   FLIGHT_MODEL_PATH=./models/Flight
 *   PRETTY=1        indent each flight assignment (much larger file)
 *
 * Seat grid: rows 1-30, columns A-J (max 300 seats per flight).
 * Seats are filled row by row, A..J, until Flight.seatCapacity is reached,
 * so the final row may be partial. Layouts are synthetic, not manufacturer cabins.
 */

const fs = require("fs");
const path = require("path");

const CONFIG_VERSION = "1.0.0";
const {
  COLUMNS, COLUMN_POSITIONS, CLASS_ORDER, CLASS_PERCENTAGES, CLASS_CODES,
  MAX_CAPACITY, allocateClassCounts, generateSeats
} = require("../services/seatAllocationService");
const MAX_ROWS = MAX_CAPACITY / COLUMNS.length;
const MAX_SEATS = MAX_CAPACITY;

// Same list as the application's aircraft selector.
const KNOWN_AIRCRAFT = [
  "Airbus A320", "Airbus A320neo", "Airbus A321", "Airbus A321neo",
  "Airbus A330", "Airbus A350",
  "Boeing 737", "Boeing 777", "Boeing 787",
  "Boeing 787 Dreamliner", "Boeing 737 MAX",
  "Embraer E190", "Bombardier CRJ900"
];

function buildSeats(flightId, capacity) {
  try {
    const classCounts = allocateClassCounts(capacity);
    const seats = generateSeats(capacity).map(seat => ({
      seatId: `${flightId}:${seat.seatNumber}`,
      ...seat,
      status: "AVAILABLE"
    }));
    return { seats, classCounts };
  } catch (error) {
    throw new Error(`Flight ${flightId}: ${error.message}`);
  }
}

function configurationForAircraft(aircraft) {
  const known = KNOWN_AIRCRAFT.includes(aircraft);
  const normalized = String(aircraft || "UNSPECIFIED").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return {
    configurationId: `DYNAMIC-${normalized}-V${CONFIG_VERSION.split(".")[0]}`,
    aircraftType: aircraft || "UNSPECIFIED",
    version: CONFIG_VERSION,
    status: known ? "ACTIVE" : "ACTIVE_UNREGISTERED_AIRCRAFT",
    layoutMode: "DYNAMIC_CAPACITY",
    layoutPolicy: "SHARED_TEN_COLUMN_SYNTHETIC",
    capacitySource: "Flight.seatCapacity",
    seatGrid: { rows: MAX_ROWS, columns: COLUMNS, maxSeats: MAX_SEATS }
  };
}

function header(aircraftTypes) {
  return {
    schemaVersion: "1.0.0",
    configurationVersion: CONFIG_VERSION,
    configurationName: "Dynamic Capacity-Based Seat Configuration",
    description:
      "Synthetic seat maps generated from each MongoDB Flight.seatCapacity. " +
      "These are application layouts, not manufacturer-certified cabin plans.",
    generation: {
      source: "MongoDB Flight collection",
      flightModel: "models/Flight.js",
      seatCapacityField: "seatCapacity",
      aircraftField: "aircraft",
      flightIdentifierField: "_id",
      seatNumbering: {
        rows: { first: 1, last: MAX_ROWS },
        columns: COLUMNS,
        seatsPerFullRow: COLUMNS.length,
        maxSeatsPerFlight: MAX_SEATS,
        columnPositions: COLUMN_POSITIONS,
        fillOrder: "Row by row, A to J, starting at row 1",
        partialFinalRow: "Only as many seats as needed to reach seatCapacity are generated."
      },
      classAllocation: {
        method: "largest-remainder",
        orderFrontToBack: CLASS_ORDER,
        percentages: CLASS_PERCENTAGES,
        rounding: "Largest remainder; ties follow the class order listed above.",
        note: "A class boundary may fall mid-row. Counts always sum exactly to seatCapacity."
      },
      seatStatusDefault: "AVAILABLE"
    },
    travelClasses: [
      { classCode: "F", name: "First", percentage: 5, displayOrder: 1 },
      { classCode: "J", name: "Business", percentage: 10, displayOrder: 2 },
      { classCode: "W", name: "Premium Economy", percentage: 15, displayOrder: 3 },
      { classCode: "Y", name: "Economy", percentage: 70, displayOrder: 4 }
    ],
    aircraftConfigurations: aircraftTypes.map(configurationForAircraft)
  };
}

async function write(stream, text) {
  if (!stream.write(text)) {
    await new Promise(resolve => stream.once("drain", resolve));
  }
}

async function main() {
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is required.");
  const mongoose = require("mongoose");

  const modelPath = path.resolve(process.cwd(), process.env.FLIGHT_MODEL_PATH || "./models/Flight");
  if (!fs.existsSync(modelPath) && !fs.existsSync(`${modelPath}.js`)) {
    throw new Error(`Flight model not found at ${modelPath}. Run from project root or set FLIGHT_MODEL_PATH.`);
  }

  await mongoose.connect(process.env.MONGODB_URI);
  const outputPath = path.resolve(
    process.cwd(),
    process.env.AIRCRAFT_CONFIG_OUTPUT || "./config/aircraft-configurations.json"
  );
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const tmpPath = `${outputPath}.tmp`;
  const out = fs.createWriteStream(tmpPath, { encoding: "utf8" });
  const pretty = process.env.PRETTY === "1";

  try {
    const Flight = require(modelPath);
    const distinct = await Flight.distinct("aircraft");
    const aircraftTypes = [...new Set([...KNOWN_AIRCRAFT, ...distinct.filter(Boolean)])];
    const doc = header(aircraftTypes);
    const configByType = new Map(doc.aircraftConfigurations.map(c => [c.aircraftType, c]));

    // Write everything except flightAssignments / capacityReconciliation first.
    const head = JSON.stringify(doc, null, 2);
    await write(out, head.slice(0, head.lastIndexOf("}")).trimEnd() + ',\n  "flightAssignments": [\n');

    let sourceCount = 0, generated = 0, declared = 0, seatTotal = 0, first = true;
    const mismatches = [];
    const cursor = Flight.find({})
      .select("_id flightNumber aircraft seatCapacity origin destination departureDate departureTime status")
      .sort({ flightNumber: 1, _id: 1 })
      .lean()
      .cursor();

    for await (const flight of cursor) {
      sourceCount += 1;
      const flightId = String(flight._id);
      const capacity = Number(flight.seatCapacity);
      const { seats, classCounts } = buildSeats(flightId, capacity);
      const cfg = configByType.get(flight.aircraft) || configurationForAircraft(flight.aircraft);

      const classSum = Object.values(classCounts).reduce((a, b) => a + b, 0);
      declared += capacity;
      seatTotal += seats.length;
      generated += 1;
      if (seats.length !== capacity || classSum !== capacity) {
        mismatches.push({
          flightId,
          flightNumber: flight.flightNumber,
          declaredCapacity: capacity,
          generatedSeatCount: seats.length,
          difference: seats.length - capacity,
          status: "MISMATCH"
        });
      }

      const assignment = {
        flightId,
        flightNumber: flight.flightNumber,
        route: { origin: flight.origin, destination: flight.destination },
        schedule: { departureDate: flight.departureDate, departureTime: flight.departureTime },
        flightStatus: flight.status,
        aircraft: flight.aircraft,
        configurationId: cfg.configurationId,
        configurationVersion: cfg.version,
        layoutMode: "DYNAMIC_CAPACITY",
        declaredCapacity: capacity,
        generatedSeatCount: seats.length,
        classCounts,
        seats
      };
      const body = pretty ? JSON.stringify(assignment, null, 2).replace(/^/gm, "    ") : "    " + JSON.stringify(assignment);
      await write(out, (first ? "" : ",\n") + body);
      first = false;
    }

    const reconciliation = {
      status: mismatches.length === 0 ? "RECONCILED" : "MISMATCH",
      reconciledAt: new Date().toISOString(),
      sourceFlightCount: sourceCount,
      generatedFlightCount: generated,
      totalDeclaredCapacity: declared,
      totalGeneratedSeats: seatTotal,
      totalCapacityDifference: seatTotal - declared,
      flightsWithMismatch: mismatches,
      rule: "Each flight must have exactly Flight.seatCapacity generated seat records."
    };
    await write(out, `\n  ],\n  "capacityReconciliation": ${JSON.stringify(reconciliation, null, 2).replace(/\n/g, "\n  ")}\n}\n`);
    await new Promise((resolve, reject) => { out.end(resolve); out.on("error", reject); });
    fs.renameSync(tmpPath, outputPath);

    console.log(`Flights: ${generated} | Declared: ${declared} | Generated seats: ${seatTotal}`);
    console.log(`Reconciliation: ${reconciliation.status}`);
    console.log(`Output: ${outputPath}`);
  } catch (err) {
    out.destroy();
    if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    throw err;
  } finally {
    await mongoose.disconnect();
  }
}

module.exports = { buildSeats, allocateClassCounts, configurationForAircraft };

if (require.main === module) {
  main().catch(err => {
    console.error("Aircraft configuration generation failed:\n" + err.message);
    process.exitCode = 1;
  });
}
