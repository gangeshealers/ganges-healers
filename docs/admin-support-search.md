# Staff Support Queue Search

The administrator-only `/admin/support` workspace now searches support tickets by the saved **subject** or the ticket owner's **name/email**, combined with existing Received/In review/Resolved/All status tabs and 30-row pagination. Staff can retain context across navigation and after saving a response.

## Security and contracts

- The server checks the signed-in ADMIN session **and** `requireCurrentAdmin()` before any support query.
- `SUPPORT_DESK_ENABLED` remains default-off until the SupportTicket schema migration is verified. A disabled environment does not query the table.
- Search terms are normalized and capped at 80 characters. `%`, `_`, and backslash are literal SQL LIKE text, not wildcard operators.
- The listing reads only staff-visible subject, request body, status, member identification and response needed for the existing workflow.
- Response forms keep status/search/page in **restricted hidden fields**, and the server rebuilds the return path from validated values; no open redirect or new public data endpoint.
- The existing `updateAdminSupportTicket` optimistic concurrency and member notification transaction remain unchanged.
- Explicit `status=ALL` is preserved, fixing a path that otherwise returned to the default Received queue.
- No schema, paid order, credit, booking or user permission changes.

## Verification

- `tests/unit/support.admin-filters.test.ts`: parsing, bounds, exact queue navigation, escaping and query shape.
- `tests/components/AdminSupport.search.test.tsx`: current admin check before any DB access, feature gate, and filter-preserving reply forms.

Rollback: revert the helper, queue page update and tests. No data migration required.
