# Member support history navigation

The signed-in member's `/dashboard/support` workspace now supports status filters (All requests, Received, In review, Resolved) and stable Previous/Next pagination for older tickets. This replaces the fixed latest-50 cap: each view retrieves at most 21 records, displays 20, and uses the additional row only to decide whether a next page exists.

Every query is scoped with `userId` from the authenticated server session. The URL cannot set an owner and repeated, malformed or unknown filter values revert to safe defaults. Page numbers are capped at 1,000 to bound offset queries. Navigation preserves the current status filter and never displays the sentinel row. Empty and out-of-range pages provide a route back to earlier requests. The existing support form, staff response display and support-enabled migration guard remain in place.

This is a read-only UI enhancement with no schema, API, provider, side-effect or authentication changes. It works alongside support reply notifications, which are introduced separately. Rollback by reverting the page and its tests without changing support data.
