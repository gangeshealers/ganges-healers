# Upcoming booking calendar export

The customer My Bookings dashboard offers **Download upcoming calendar** when at least one upcoming booking is loaded. It downloads a private, RFC 5545 iCalendar (`.ics`) **snapshot**, suitable for manual import into common calendar apps. It is **not** an ongoing calendar subscription or a remote Google Calendar write.

`GET /api/bookings/calendar` requires the current authenticated account. The query always uses the signed-in user's database ID, regardless of URL parameters or user role, and selects future `PENDING`, `SCHEDULED`, `CONFIRMED`, and `RESCHEDULED` appointments in chronological order. Completed, cancelled, and past appointments are excluded. Existing booked appointments are never modified. A valid empty `.ics` is returned for a user without upcoming bookings.

The calendar feed uses the same RFC 5545 renderer as the individual booking downloads at `GET /api/bookings/[id]/calendar`. VEVENT identifiers are stable per booking; modified times and SEQUENCE values follow the stored booking record; timestamps are exported as UTC to let calendar clients display them in their own timezone. Text/newline/control characters are escaped and long UTF-8 lines are folded. It contains the session/service name and practitioner's name but no customer address or payment details. **Only a confirmed appointment can carry a safe HTTPS meeting URL**; pending or unfunded reschedules are exported as `TENTATIVE` without any room link.

The endpoint returns private/no-store cache headers and a CSV-independent `text/calendar` attachment. At most **100** upcoming appointments are exported; if more exist it returns HTTP 413 instead of quietly generating an incomplete calendar. Errors and sign-in failures always return JSON rather than a partial calendar.

Tests cover single-event backwards compatibility, multiple VEVENTs, UTC dates, newline injection/UTF-8 folding, ownership isolation, unconfirmed links and the user-facing download action.

No schema migration, extra provider scope, third-party API, scheduler, or new secret is required. Roll back this change by reverting the shared renderer refactor, the new route and dashboard link; existing individual appointment exports remain independently supported.
