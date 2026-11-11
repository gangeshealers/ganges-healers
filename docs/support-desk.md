# Member support desk

The application has an **authenticated**, private support inbox. This is an in-app request/response workflow, not a transactional email system or an anonymous contact form.

## Member flow

1. Sign in and open **Support center** from the account menu or member dashboard (`/dashboard/support`).
2. Submit a subject (5–120 characters) and message (20–3,000 characters). Avoid entering passwords, card data or other credentials.
3. Track the status and any staff response in the same private support center. Tickets are scoped by the current session's user ID; the client never supplies the owner.
4. Status labels: Received, In review and Resolved. No email/SMS response or guaranteed response time is implied.

`POST /api/support/tickets` accepts only JSON from an authenticated session, validates the origin when present, and caps bodies to 8,000 characters before parsing. It returns only `{ id, status }` (201) with `Cache-Control: no-store`. Failures include 401 (guest), 403 (foreign origin), 400 (invalid input), 413 (body too large), 415 (wrong content type), 429 (submission limit), and 500 (generic failure). It does not return other users' tickets or private content.

Each member may submit up to **five tickets in a rolling 24 hours**. A Postgres transaction-scoped advisory lock serializes that account's count-and-create operation across serverless instances. This limit uses the persistent database and does not depend on the optional Redis worker.

## Admin flow

Administrators open the **Support queue** account shortcut (`/admin/support`). All reads require a current administrator, and the queue supports Received / In review / Resolved filters and paged results. A staff member may update status and write one member-visible response; the write uses the ticket's `updatedAt` revision to reject overwriting newer staff changes. A member can see the response on the next visit or refresh.

The system stores content and account references in PostgreSQL. Support messages can contain personal details and should not be copied to analytics logs, URLs, or third-party systems. The admin queue is not public. Account deletion cascades the user's support tickets along with the account record, consistent with the new foreign key.

## Deployment

**Fail-closed rollout:** `SUPPORT_DESK_ENABLED` defaults to disabled. Until it is set to the exact string `true`, member and admin pages show a safe unavailable message and the POST endpoint returns HTTP 503 without querying `SupportTicket`. Admin update actions refuse changes while disabled.

Apply and verify migration `20261111010000_member_support_desk` in each intended database environment *before* enabling this variable there. Do not enable the feature for production without database cutover, support staffing, and data-retention/privacy review. A Vercel Preview deployment can contain the code with the feature disabled until its own Preview database is migrated.



Migration: `20261111010000_member_support_desk`. Apply it **only** to the intended database branch, using the repo's established deployment migration workflow and verifying the target first. Do not apply migrations or customer messages to the production database as part of this feature PR.

The workflow requires **no new external providers or environment variables**. It does not claim email delivery, support SLAs, attachments, chat, or remote case management. Production rollout requires a data-retention/privacy review and an operational support team.

## Rollback

The feature's new pages, API, account shortcuts, and service code can be reverted without modifying checkout or payments. Once migrated, preserve the table as historical support data rather than dropping it to roll back; perform a planned forward migration if a schema correction is needed.
