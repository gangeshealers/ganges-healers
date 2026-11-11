# Practitioner session-payment activity

The signed-in practitioner now has a private `/healer/payments` ledger, reachable from the healer dashboard, the healer navigation and account menu. It shows **gross successful INR customer session charges**, not practitioner compensation, commission, payout statements, balances due, or bank settlements. The existing healer dashboard and `GET /api/healer/earnings` totals now restrict to INR payments and use India-local month boundaries; response fields remain backwards compatible.

## Query boundary

Both the member-facing ledger and `GET /api/healer/earnings/export` use `requireHealer()` and the authenticated healer record ID rather than a URL-supplied identity. Every Payment query filters by `booking.healerId`, `statusEnum=SUCCESS`, and `currency=INR`. Refunded payment statuses, non-INR payments, other providers' sessions and unrelated course/store/program purchases are excluded. This is gross, not net: approved refunds pending provider reconciliation, platform commissions, taxes, gateway fees and practitioner payouts are **not** subtracted or inferred. No customer names, emails, contact details or meeting links appear in the ledger/export.

The filters are month (India calendar month, beginning 00:00 IST on the first), last 90 elapsed days, and all-time. These filter on **Payment.createdAt**, meaning payment record *creation*, not a capture/settlement timestamp (the model does not have a dedicated capture time). In particular, monthly aggregates describe successful payments **whose records were created this month**, not necessarily money captured this month. These distinctions must remain visible until a real payout/settlement accounting system exists.

The ledger uses 20 rows per page, a stable newest-first sort and bounded pages 1–1000. All-time views without results have an empty state. The CSV endpoint exports up to 1000 matching rows with UTF-8 BOM, fixed column names, RFC 4180 CSV escaping and spreadsheet formula-injection neutralization. If more than 1000 match, it returns HTTP 413 rather than silently truncating an export. Repeated or unsupported filter parameters return 400, and 401/403 return JSON. Private/no-store and nosniff headers prevent intermediary caching. CSV excludes internal Payment IDs and user personal data; it contains a booking reference for internal reconciliation, session time, service and gross amount.

Unit, component and database-backed integration coverage verify India month rollover, selection, auth, owner isolation, refund exclusion, filters, pagination and output safety.

No schema migration, provider call, bank integration, payout action or new secret. Before using this as a compensation report, a separate approved ledger covering commissions, taxes, refund/chargeback outcomes, provider capture timestamps and actual payouts is required. Rollback by reverting the new ledger, export, navigation, labels/tests/docs; underlying payment records remain unchanged.
