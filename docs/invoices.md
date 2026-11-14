# Invoices: Public Route, Generator, and Admin Trigger

- Public route contract
  - GET `/api/invoices/[id]`
  - 302 Redirect to PDF URL on success; 404 if not found
  - Lookup precedence (must not change):
    1) `Payment.invoiceUrl` (legacy fast path)
    2) `Payment.invoice.pdfUrl` (relation)
    3) `Invoice.pdfUrl` (by invoiceNumber or id)
  - No JSON body on success

- Viewer page (read-only)
  - Path: `/invoices/[id]/view`
  - Resolves via the exact same precedence (pure read-only; no generation)
  - Renders a simple toolbar: Open PDF, Download, Print; embeds the PDF with `<embed>`
  - Metadata: `noindex, nofollow`; canonical points to `/invoices/[id]/view`
  - No changes to existing API contracts

- Viewer links in UI
  - Dashboard/Admin lists build links via precedence: invoiceNumber → paymentId → id
  - “View” opens in a new tab; “Copy link” copies the absolute URL
  - UI-only; no backend calls or behavior changes

- Generator behavior
  - `createAndStoreInvoicePdf(lookupId, { force? })`
  - Idempotent:
    - If legacy `Payment.invoiceUrl` exists → early return (unless `force`)
    - If `Invoice` exists for payment → early return (unless `force`)
    - On generate: minimal `pdf-lib` PDF → upload to Vercel Blob → upsert `Invoice` → attempt legacy `Payment.invoiceUrl` patch (best-effort)
  - Logs: `[invoices][gen]` (`start_lookup`, `idempotent_skip`, `[error][pdf|upload|persist]`, `[done]`)

- Admin trigger
  - POST `/api/admin/invoices/generate` `{ id, force? }` → `{ url } | { error, detail }`
  - Logging: `[admin][invoices][generate]`

- Booking refunds
  - Booking cancellation uses the saved booking and successful Razorpay payment
    amount to calculate the policy refund on the server.
  - A refund intent is stored before calling Razorpay. The API reports the
    provider state as pending, confirmed, failed, unavailable, or unknown; it
    never treats a simulated refund as completed.
  - Retries fetch a known Razorpay refund instead of issuing another request.
    If the request outcome is uncertain and no refund ID was received, automatic
    retries stop and the refund requires operational reconciliation.
  - Older cancelled bookings without a persisted refund intent are not refunded
    automatically because the earlier flow cannot prove whether Razorpay was
    already called. Support must verify the payment/refund in the Razorpay
    dashboard before taking action.
  - `REFUNDS_ENABLED` is no longer used; eligible cancellations attempt a real
    Razorpay refund when the gateway credentials are configured.

- Optional legacy `Payment.invoiceUrl` compatibility
  - The current Prisma `Payment` model does not require a physical `invoiceUrl` column. Legacy invoice lookups use `to_jsonb(payment_row)->>'invoiceUrl'`, which safely returns null if that historical column is absent.
  - The precedence remains **legacy URL first**, then `Payment.invoice.pdfUrl`, then direct `Invoice.pdfUrl`. No migration or backfill is needed for modern tables.
  - The older invoice generator checks `information_schema.columns` before attempting a legacy-column write. Current databases no longer produce repetitive missing-column error logs during invoicing.
  - `tests/integration/invoices.optional-legacy-column.test.ts` checks real PostgreSQL reads and an existing invoice's idempotent generator behavior. It does not call Blob storage or payment providers.

- Tests that pin contracts
  - `invoices.public.route.precedence.test.ts`
  - `invoices.generator.idempotency.test.ts`

## Customer billing history

The authenticated `/dashboard/billing` page queries issued invoices for the current session's payment owner. Payment-type filtering (SESSION, PROGRAM, MEMBERSHIP, STORE, COURSE), an 80-character bounded invoice-number search and stable newest-first pages of up to 25 receipts replace the old unfiltered 100-record cap. Invalid or repeated query values safely reset to the default; page numbers are bounded to 1–1000, with a 26th row used only to determine whether the next page exists.

Billing and My Bookings link to `/dashboard/billing/[id]` for an issued invoice. The receipt checks the signed-in payment owner and renders the saved recipient, line items and totals. Members can print the receipt even when PDF upload failed. A stored PDF also has a viewer link. The bookings API includes a nullable `receiptId` for session invoices owned by the booking member. Filters survive Previous/Next links. Empty and filtered-out histories provide recovery navigation. This is a read-only customer interface; the existing `GET /api/invoices/me`, invoice lookup/redirect and generation endpoints retain their contracts. No migration, provider access or new dependency is needed.

### Member CSV export

`GET /api/invoices/me/export` downloads all matching issued invoice rows (up to 1,000), not merely the visible page. It uses the same invoice-number and purchase-type filters as billing history, binds the query to the authenticated member's payment owner and never accepts a user ID from URL parameters. Repeated filters reset to safe defaults; unknown payment types return 400. More than 1,000 matching rows returns 413 rather than a silently incomplete file. Response headers force CSV attachment delivery and private/no-store caching. Identifiers that could be evaluated as spreadsheet formulas are escaped. CSV contains issue date, invoice number, purchase type and INR amount only, without customer or internal payment identifiers. No new environment or schema setting is needed.
