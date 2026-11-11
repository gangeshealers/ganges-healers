# Customer dashboard: upcoming appointment preview

The customer dashboard homepage is a **next-appointments snapshot**, not a full historical booking ledger. It now queries at most five future bookings owned by the authenticated customer, ordered from nearest start to latest (with ID as a stable tie-breaker). Status must be `PENDING`, `SCHEDULED`, `RESCHEDULED` or `CONFIRMED`; cancelled, completed and past sessions are excluded from this preview, but are preserved in the existing `/dashboard/bookings` history and management page.

The dashboard title is **Upcoming appointments**, with an always-visible **View all bookings** link to the complete owner-scoped booking management page. For an empty upcoming list it explains that prior sessions remain available and offers a route to browse services. Session dates/times are displayed explicitly in `Asia/Kolkata` (IST), avoiding viewer device/browser timezone confusion.

Only the dashboard query and presentation are changed. Booking mutation endpoints, refund/credit rules, individual booking controls, financial records and appointment data are unchanged. Tests cover authentication/owner filtering, bounded future query, correct chronological ordering, full-history navigation and fixed IST formatting.

No migration, provider request or new secret. Rollback is a code revert; the historical bookings remain untouched.
