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
const MAX_ROWS = 30;
const COLUMNS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"];
// ASSUMPTION: 3-4-3 abreast. Change here if you want a different aisle pattern.
const COLUMN_POSITIONS = {
  A: "WINDOW", B: "MIDDLE", C: "AISLE",
  D: "AISLE", E: "MIDDLE", F: "MIDDLE", G: "AISLE",
  H: "AISLE", I: "MIDDLE", J: "WINDOW"
};
const MAX_SEATS = MAX_ROWS * COLUMNS.length; // 300

const CLASS_ORDER = ["First", "Business", "Premium Economy", "Economy"];
const CLASS_PERCENTAGES = { First: 5, Business: 10, "Premium Economy": 15, Economy: 70 };
const CLASS_CODES = { First: "F", Business: "J", "Premium Economy": "W", Economy: "Y" };

// Same list as seedFlights.js
const KNOWN_AIRCRAFT = [
  "Airbus A320", "Airbus A320neo", "Airbus A321", "Airbus A321neo",
  "Airbus A330", "Airbus A350",
  "Boeing 737", "Boeing 777", "Boeing 787",
  "Boeing 787 Dreamliner", "Boeing 737 MAX",
  "Embraer E190", "Bombardier CRJ900"
];

function allocateClassCounts(capacity) {
  const counts = {};
  const remainders = [];
  let allocated = 0;
  for (const name of CLASS_ORDER) {
    const exact = (capacity * CLASS_PERCENTAGES[name]) / 100;
    const whole = Math.floor(exact);
    counts[name] = whole;
    allocated += whole;
    remainders.push({ name, remainder: exact - whole });
  }
  remainders.sort(
    (a, b) => b.remainder - a.remainder || CLASS_ORDER.indexOf(a.name) - CLASS_ORDER.indexOf(b.name)
  );
  const remaining = capacity - allocated;
  for (let i = 0; i < remaining; i += 1) counts[remainders[i].name] += 1;
  return counts;
}

function buildSeats(flightId, capacity) {
  if (!Number.isInteger(capacity) || capacity <= 0) {
    throw new Error(`Flight ${flightId} has invalid seatCapacity: ${capacity}`);
  }
  if (capacity > MAX_SEATS) {
    throw new Error(
      `Flight ${flightId} seatCapacity ${capacity} exceeds the ${MAX_SEATS}-seat grid (rows 1-${MAX_ROWS} x columns A-J).`
    );
  }
  const classCounts = allocateClassCounts(capacity);
  const seats = [];
  let index = 0;
  for (const className of CLASS_ORDER) {
    for (let n = 0; n < classCounts[className]; n += 1, index += 1) {
      const row = Math.floor(index / COLUMNS.length) + 1;
      const column = COLUMNS[index % COLUMNS.length];
      seats.push({
        seatId: `${flightId}:${row}${column}`,
        seatNumber: `${row}${column}`,
        row,
        column,
        position: COLUMN_POSITIONS[column],
        travelClass: className,
        classCode: CLASS_CODES[className],
        status: "AVAILABLE"
      });
    }
  }
  return { seats, classCounts };
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
