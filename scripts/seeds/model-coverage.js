module.exports = Object.freeze({
  User: { seed: 'users.seed.js', reason: 'Disabled demo customers only; administrators remain separately provisioned.' },
  Flight: { seed: 'flights.seed.js', reason: 'Stable fixture flights with layout references.' },
  AircraftLayout: { seed: 'aircraftLayouts.seed.js', reason: 'Shared A–J layouts derived from the canonical seat utility.' },
  Reservation: { seed: 'reservations.seed.js', reason: 'Sample bookings linked to fixture users and flights.' },
  SeatAllocation: { seed: 'seatAllocations.seed.js', reason: 'Derived, unique seat claims for seeded reservations.' },
  PopularFlight: { seed: 'popularFlights.seed.js', reason: 'Featured records reference fixture flights.' },
  BookingIntegrityState: { seed: 'bookingIntegrityState.seed.js', reason: 'Initialized only after the unique index and active seat claims are verified.' },
  AuditLog: { excluded: 'Do not fabricate audit history or actor actions.' },
  HolidayCalendar: { excluded: 'Requires an approved, versioned source of jurisdictional holiday data.' },
  PrivacyRequest: { excluded: 'Do not create misleading synthetic personal-data requests.' },
  AdminApprovalRequest: { excluded: 'Do not fabricate pending or approved privileged operations.' },
  EmergencyAccessGrant: { excluded: 'Never create synthetic emergency-access grants.' }
});
