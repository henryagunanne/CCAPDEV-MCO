# Archers Airline database seeds

Run from the project root:

```bash
npm run seed
```

The runner uses the project's `MONGODB_URI` through `config/env.js` and the existing Mongoose models. It is deliberately disabled when `NODE_ENV=production`. It uses stable fixture identifiers and `$setOnInsert`/upserts; it does not drop collections or delete existing application records.

## Execution order

1. `users.seed.js` — creates disabled demo customer accounts with random, unshared passwords. No administrator is seeded.
2. `aircraftLayouts.seed.js` — ensures the standard 10-column A–J layout definitions exist.
3. `flights.seed.js` — creates three stable sample flights and associates their layouts.
4. `reservations.seed.js` — creates sample reservations linked to those fixture users and flights.
5. `seatAllocations.seed.js` — creates unique seat claims and reconciles fixture flight `bookedSeats`.
6. `bookingIntegrityState.seed.js` — verifies the unique flight-seat index and all active reservation seat claims before marking the booking integrity state ready.
7. `popularFlights.seed.js` — creates featured-flight records linked to existing fixture flights.

## Model coverage

| Model | Seed treatment |
|---|---|
| User | `users.seed.js`; disabled customer fixtures only |
| Flight | `flights.seed.js`; stable sample flights |
| AircraftLayout | `aircraftLayouts.seed.js`; shared A–J layout |
| Reservation | `reservations.seed.js`; linked fixture bookings |
| SeatAllocation | `seatAllocations.seed.js`; derived seat claims |
| PopularFlight | `popularFlights.seed.js`; linked featured flights |
| BookingIntegrityState | `bookingIntegrityState.seed.js`; only after index and claim verification |
| AuditLog | Intentionally not populated with fabricated audit events |
| HolidayCalendar | Intentionally excluded; must be loaded from an approved, versioned holiday source |
| PrivacyRequest | Intentionally excluded; synthetic requests would create misleading privacy-case records |
| AdminApprovalRequest | Intentionally excluded; no fake pending/approved privileged actions |
| EmergencyAccessGrant | Intentionally excluded; no synthetic emergency-access grants |

## Administrator provisioning

The seed runner never creates an administrator or sets MFA as completed. Use the existing interactive provisioning command:

```bash
npm run provision:admin
```

It requires an interactive terminal, an administrator email consistent with `ADMIN_EMAIL` when configured, and a strong password. Administrators must complete the existing MFA enrollment flow.

## Environment

Configure the same required variables used by the application in `.env`, including `MONGODB_URI`, `SESSION_SECRET`, `PASSPORT_ENCRYPTION_KEY`, and `MFA_ENCRYPTION_KEY`. The seed runner imports `config/env.js`; it does not introduce a second database connection configuration.

## Existing databases and reset safety

`npm run seed` is non-destructive and is not a database reset command. No automatic reset command is provided. For legacy flights without an `aircraftLayoutId`, first inspect the existing configuration import in dry-run mode:

To get legacy flights, reservations, popularFlights, and users seed, uncomment lines 17-20 and 30-36 lines in `app.js`

```bash
npm run import:aircraft-configurations
```

If the configuration does not match the live flights, regenerate it from the live database with `npm run generate:aircraft-configurations`, then rerun the import dry-run. Apply only after reviewing the planned assignments:

```bash
npm run import:aircraft-configurations -- --apply
```

Next, inspect the existing booking-integrity migration in dry-run mode:

```bash
npm run migrate:booking-integrity
```

Review every reported conflict. Only then apply it explicitly:

```bash
npm run migrate:booking-integrity -- --apply
```

The migration is separate from application startup and from normal seeding. Back up the database before applying it. Never run destructive maintenance against production. The seed runner itself refuses `NODE_ENV=production`; it never drops collections.

The current `Flight`, `Reservation`, `SeatAllocation`, and `AircraftLayout` schemas already constrain seat labels to the A–J convention, and the checked-in aircraft configuration already declares columns A–J. Therefore this change does not renumber stored reservation seats. If a legacy database contains identifiers outside that convention, preserve those records and resolve them through a separately reviewed migration; do not silently rewrite passenger assignments.
