# Store-order operations: exact reference lookup

The private `/admin/orders` workspace previously showed only the newest fulfillment queues (Paid, Shipped and Delivered). Staff could not directly find an older order or one still awaiting payment, except through unrelated screens. The queue now supports **All statuses** and a **Find order** search using an exact order reference, with bounded 25-row pagination. The default Paid queue remains unchanged for shipment processing.

## Authentication and browsing

Both the list page and `/admin/orders/[id]` fulfillment detail check the signed-in `ADMIN` session and independently call `requireCurrentAdmin()` to verify the current database role **before** querying order records. Revoked administrators and ordinary accounts cannot browse or open shipment data from an old session claim. The detail page also rejects empty or oversized order IDs.

Search is an **exact ID match**, never fuzzy user email/name lookup or user-controlled query construction. The search form switches to All statuses so a saved order can be found even when no longer in the Paid queue. The queue tabs preserve any validated exact reference. Order status is one of the server-defined queue views: Paid, Shipped, Delivered (including historically fulfilled) or All. Unknown, malformed or repeated query parameters reset to a bounded default. Pages are clamped to the last available page, with a max page value of 1000, and sort stably by creation time and ID. The default Paid queue shows oldest outstanding paid orders first; other queues show newest records first.

The list shows order reference, saved status, line count, amount and India-local creation date. A saved order's status **is not independently proof of customer payment settlement or real-world delivery**. Payment reconciliation and shipment actions remain separate audited workflows, with shipment tracking/version-bound updates and explicit delivery confirmation. This change neither moves a status automatically nor grants new payment/refund capabilities.

Unit and SSR component tests check current-admin authorization before queries, all-status exact lookup, queue semantics, filter bounds, page clamping and empty states. The real browser store-fulfillment journey also finds a recently delivered order through the new search interface.

No migration, new provider, payment change, shipment update, secret or live customer-data action was performed during implementation. Rollback by reverting the lookup helper, two admin page changes, tests and this document. Existing orders and tracking histories remain intact.
