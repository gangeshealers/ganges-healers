# Admin booking operations explorer

The authenticated administrator workspace now links to `/admin/bookings`, a private read-only schedule explorer. It is intended for staff triage and support rather than changing booking state. It does **not** confirm, reschedule, cancel, refund, email, create meetings or expose provider secrets.

## Authorization and privacy

The route requires an authenticated `ADMIN` session and independently calls `requireCurrentAdmin()` before any booking query. The admin role must still be present in the database. Ordinary members and practitioners cannot access the explorer. The page is marked noindex and renders no meeting URLs, payment tokens, gateway signatures, refund secrets, session data or mutation controls. It shows a member name (or account email fallback), assigned practitioner, service, status, scheduling time and opaque booking reference to aid authorized support staff; none of these identifiers are placed into outgoing third-party links.

## Filters, size and interpretation

The default view is upcoming appointments. Date scope can switch to Past or All dates, and staff may filter by any saved booking status. The search box accepts an **exact booking reference**, not a user-controlled raw SQL expression or a fuzzy customer-email search. All filter parameters are bounded and invalid/repeated values reset to safe defaults. Pages show 25 entries, ordered nearest-first for upcoming and newest-first otherwise, with ID tie-breakers; maximum page 1000 bounds database offsets. For larger data sets, use exact reference, date and status filters.

The booking's **delivery state** is derived using the existing `bookingDeliveryState()` helper, not a new payment formula. 'Delivery confirmed' refers to an appointment marked confirmed (including legacy confirmed records) or a funded/free eligible reschedule; it is not a guarantee of funds settled to a bank. 'Matching captured payment' means the saved payment is SUCCESS and its value matches the booking's price. Applying a session credit and free appointments are labelled separately. Missing or mismatched payment records are not silently counted as paid. These fields are advisory for operational triage; the server actions that actually change bookings still enforce their own fresh transaction and ownership checks.

Navigation provides paths to the separate Booking Emails and Payment Reconciliation workspaces. The explorer is read-only even for an administrator, so irreversible refunds and paid booking cancellations remain in reviewed operational workflows.

Unit and server-component tests cover authorization-before-query, revoked admin role, exact-reference search, status/time filters, no customer meeting data, delivery-state labels, pagination and empty recovery. No new API, migration, provider dependency, secret or production-side action is introduced. Rollback by reverting this page/helper, admin navigation and tests, leaving all saved appointments untouched.
