# Customer Store Order History Search

## Customer workflow
The authenticated **My Orders** page at `/dashboard/orders` can now find an older purchase by:
- Full saved order ID (exact match).
- Part of the current product title from an item on that order (case-insensitive).

Search can be combined with the existing **All / Pending payment / Paid / Shipped / Delivered / Cancelled** status tabs. The search form retains the selected status; changing a tab retains the search text and resets to page 1. Previous/Next links preserve both filters. Clear search retains the selected status.

## Contracts and privacy
- Server-side Prisma queries always include `userId` from the authenticated session. Order IDs supplied in the URL are not trusted as an owner selector.
- Only orders belonging to the signed-in user are returned. Search does not disclose another account's products, shipment address, contact details, or payment credentials.
- Product-title search escapes SQL LIKE `%`, `_`, and backslash so they are literal text, not user-controlled wildcard expressions.
- A query is trimmed and limited to 80 characters. Duplicate array-valued query params are ignored. Pagination is limited to 50 orders per page, with a maximum page of 1000.
- This is a read-only search enhancement: no new endpoint, schema, payment behavior, stock mutation, or subscription behavior.

## Limits
Search matches **current product titles**, not historical title snapshots. Exact order-ID matching requires the complete order reference. The UI lists one page at a time and does not calculate an expensive total count.

## Patch verification
- Unit: `tests/unit/store.order-history.test.ts` validates filter normalization, ownership, SQL wildcard escaping, and generated links.
- E2E: `tests/e2e/store.orders.spec.ts` exercises product search, exact-reference search, literal `%`, status/tab navigation, and existing cross-account isolation.
- Release branch integration and hosted checks remain subject to CI and reviewer approval.

Rollback: revert this feature's helper, page change, test updates and documentation. No database migration or data recovery is needed.
