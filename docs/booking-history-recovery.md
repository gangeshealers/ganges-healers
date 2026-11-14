# Member booking list recovery

The authenticated `/dashboard/bookings` page has always loaded the current user's saved booking history through `GET /api/bookings`. It now provides explicit recovery paths:

- **Signed out:** a sign-in link returns to the bookings page after authentication, plus a public Services link. No booking request is sent without a signed-in owner.
- **Transient read error:** a retry button re-fetches the existing bookings, not creating a new booking or payment. Existing booking records are not mutated on retry.
- **Empty lists:** Upcoming shows a direct Service discovery action; Past explains that completed/cancelled appointments appear after they exist. Both views remain independently accessible.

Booking ownership, status normalization, payment confirmation, cancellation/refund logic, rescheduling, review posting, and session access are unchanged. The retry applies only to the read-only list API.

No provider, migration or API contract change. Rollback: revert the client view and the new component test.
