# Issued store invoices in customer order details

Signed-in customers can open a saved store order from `/dashboard/orders`. The order details page now displays **Receipt and billing** for settled or otherwise non-pending orders. If the order has an issued invoice, **View order invoice** opens the existing `/invoices/<invoice-number>/view` viewer, and **View all billing history** links to the new searchable dashboard. If the invoice does not yet exist, the page says so rather than displaying an invented URL or triggering an invoice generation attempt.

The link is derived only from `Order.paymentId` on an order already found with `{ id, userId: session.user.id }`. The follow-up lookup checks the same user against a `STORE` payment and returns its actual invoice relation. If payment metadata includes `orderId`, it must match the saved order; an explicitly mismatched value never generates a link. Older correctly bound orders without metadata still work through the saved `Order.paymentId`. The browser never passes a payment ID for lookup, and foreign orders retain the existing 404.

This is a read-only navigation feature. No invoice generation, stock mutation, checkout retry, refund action, database migration, third-party provider request or new configuration is introduced. Tests cover owner-scoped payment selection, mismatch/missing invoice, legacy compatibility, and real-browser paid order receipt visibility.

Revert the helper and order details section to roll back; existing issued invoices and payment records remain untouched.
