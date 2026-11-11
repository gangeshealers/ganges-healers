# Practitioner verification at new booking entry points

Public practitioner discovery is restricted to active and verified healer profiles. The same policy must be enforced inside the server-side reservation validator: a deep link or fabricated healer ID cannot create a new session merely because an archived practitioner still has saved working hours.

- `validateBookingSlot` requires `Healer.isActive=true` and `Healer.isVerified=true` for **new service bookings** regardless of test mode. The check runs inside the booking transaction after the per-healer lock; inactive services and conflicts remain guarded separately.
- `GET /api/availability` exposes no public slots for inactive or unverified healers. The helper checks verification before querying schedule conflicts.
- A previously paid customer booking can retain its existing reschedule preview and transaction via `excludeBookingId`; unverification does not erase historical appointments or break grandfathered scheduling.
- Paid program sessions continue using their existing assigned healer and saved enrollment rules. This public-acquisition guard does not block program fulfillment.
- No edits to the healer verification admin process, existing booking/payment records, pricing, schema or provider configuration are made.

The guard is read-time and does not migrate historical records. Rollback by reverting the validator and tests; existing bookings remain intact. Unit tests pin the direct validator/public slots, existing-booking exception, paid program path, and test-mode behavior.
