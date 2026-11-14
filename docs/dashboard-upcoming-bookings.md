# Member dashboard and continuation

`/dashboard` is the private account home. The server resolves authentication before any database read, loads independent sections concurrently and renders a personal welcome, an owned unread-notification count, and six account workspace links. Bookings, course enrollments, and program enrollments are always scoped to the signed-in member. The page is dynamic and noindex; no private result is cached across accounts.

## Upcoming appointments

At most five future bookings are selected, in stable chronological order, for `PENDING`, `SCHEDULED`, `RESCHEDULED` or `CONFIRMED` states. Cancelled, completed and past bookings remain in booking history. Times use Asia/Kolkata (IST). Reschedule and cancellation links still open the existing reviewed booking workflow; invoice links retain their saved payment-ID precedence. No booking mutation moved into the dashboard.

## Learning and programs

The three most recent active/completed course enrollments show their actual completed-lesson count and link directly to the first unfinished lesson. Lesson order can be sparse or zero-based. A shared pure helper in `src/lib/courses/progress.ts` keeps the dashboard and existing learning library consistent; a separate helper is justified because both server-rendered pages use it without importing a page or database access code. Completed courses offer review and courses without lessons offer the course overview. Archived courses remain accessible to their enrolled owners.

The three most recent active/paused programs reuse the existing program enrollment projection, preserving the purchased schedule even if the catalog changes. Cards show completion, current practitioner, paused/review states and only confirmed future reservations. Suggested dates are never presented as appointments. The dashboard does not expose room URLs, customer emails, staff permissions, or raw schedule/payment payloads. Full program controls remain in My Programs.

## Community and account navigation

Community previews exclude moderated posts and deleted comments. Orders, membership, billing, notifications, support and account settings remain accessible through direct workspace links. Empty states point to the relevant catalog or history instead of inventing activity.

The former `DashboardClient` filename is retained, but its content is server-rendered; it requires no browser fetch or dashboard hydration. Database selects include display fields only, never complete practitioner user records or payment payloads.

## Verification and rollback

Focused coverage checks authentication/ownership, limited field selection, actual course continuation including archived access, purchased program progress, reservation states, desktop/mobile navigation and service-session display. Existing unit/component suites were extended; the course browser journey now returns through the dashboard. Revert the code changes to roll back. No API shape, enum, log namespace, provider call, schema, dependency or data migration changes.
