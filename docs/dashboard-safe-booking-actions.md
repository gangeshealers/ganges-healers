# Safe booking actions from the customer dashboard

The customer dashboard is a **preview**, not a booking availability editor or a refund confirmation screen. Its former `+1d` shortcut guessed a new date without showing conflict-checked times. Its one-click `Cancel` button sent an immediate DELETE without displaying the refund policy or requiring a reviewed booking version. Both shortcuts are replaced by non-mutating links to the member's `/dashboard/bookings` workspace:

- `/dashboard/bookings?reschedule=<booking-id>` opens the established `RescheduleModal` with server-sourced availability, a user-selected IST slot, 24-hour-window checks and the version-bound If-Match update.
- `/dashboard/bookings?cancel=<booking-id>` opens the established `CancelDialog`, which explains refund consequences and requires explicit confirmation before the version-bound DELETE.

The receiving page waits until the signed-in account's bookings are loaded. It resolves the requested ID **only** from that authenticated account's list and checks the booking's current eligibility before opening a dialog. Unknown/foreign, expired, duplicate, ambiguous or malformed requests never authorize a mutation. A rejected shortcut displays a non-destructive explanation and leaves the full list available. On consumption, the one-time intent is removed from the browser URL to prevent an unexpected dialog reopening after refresh. The receiving server endpoints continue to enforce ownership, availability, cutoff periods and optimistic concurrency independently of this UI.

Component tests cover link encoding, owned reschedule/cancellation review, ambiguous and foreign IDs, zero automatic PUT/DELETE, and one-time URL consumption. Existing booking workflow tests cover actual availability, refund outcomes and stale writes.

No schema, provider, scheduled job, payment resource or booking endpoint is changed. Existing dashboard book/cancel buttons no longer perform any write; members make explicit decisions in My Bookings. Rollback is a code revert. Booking records and refund outcomes remain untouched.
