# Deployment Guide

This guide covers deploying Ganges Healers to production on Vercel with supporting services.

## Prerequisites

- [Node.js 20+](https://nodejs.org)
- [pnpm 10+](https://pnpm.io)
- A [Vercel](https://vercel.com) account
- A [Neon](https://neon.tech) or PostgreSQL database
- A [Razorpay](https://razorpay.com) account (payments)
- (Optional) [Upstash Redis](https://upstash.com) for background jobs & caching
- (Optional) [Resend](https://resend.com) for transactional email
- (Optional) [Sentry](https://sentry.io) for error monitoring

---

## 1. Database Setup (Neon PostgreSQL)

1. Create a Neon project at <https://console.neon.tech>
2. Copy the connection string (pooled endpoint recommended)
3. Run migrations:

```bash
DATABASE_URL="<your-connection-string>" npx prisma migrate deploy
```

4. Seed demo data (optional):

```bash
DATABASE_URL="<your-connection-string>" pnpm seed
```

> **Note:** The project uses manual migrations. Never run `prisma migrate dev` against production — only `prisma migrate deploy`.

---

## 2. Environment Variables

Copy `.env.example` and fill in all values. At minimum you need:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `AUTH_SECRET` | NextAuth session signing key (`openssl rand -base64 32`) |
| `RAZORPAY_KEY_ID` | Razorpay API key |
| `RAZORPAY_KEY_SECRET` | Razorpay API secret |
| `RAZORPAY_WEBHOOK_SECRET` | Razorpay webhook verification secret |
| `CRON_SECRET` | Secret for authenticating cron endpoint calls |

Set these in Vercel under **Project → Settings → Environment Variables**.

### Google sign-in (optional)

Set both `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET` to enable Google. The legacy pair `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` is also supported. Configure the exact `/api/auth/callback/google` URL for the deployment's stable hostname in the Google OAuth client. Secrets stay on the server. The sign-in screen discovers enabled providers from Auth.js and offers Google only when configured. Google identities must have a verified email; password verification and account-linking protections remain enabled.

### Preview payments

Preview uses a separate database and authentication secret. Its Razorpay variables must be test-mode credentials: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, and `NEXT_PUBLIC_RAZORPAY_KEY_ID`. Test credentials added to the earlier Vercel workspace on November 4, 2026 do not establish configuration of the new Ganges-owned workspace. Its verified November 5 Preview has only branch-scoped database, authentication and cron secrets. Deploy again after environment changes, and configure a test-mode webhook for the Preview hostname before gateway callback verification. A configured key is not proof that a checkout or callback succeeded.

See `.env.example` for the full list including optional variables.

---

## 3. Vercel Deployment

### Initial Setup

```bash
# Install Vercel CLI
pnpm add -g vercel

# Link to project
vercel link

# Deploy
vercel --prod
```

### Automatic Deployments

Connect your GitHub repository in the Vercel dashboard. Every push to `main` will trigger a production deployment.

### Build Configuration

The project uses these defaults (auto-detected by Vercel):

- **Framework:** Next.js
- **Build Command:** `next build --turbopack`
- **Install Command:** `pnpm install` (runs `prisma generate` via postinstall)
- **Output Directory:** `.next`

### Security Headers

Security headers (X-Frame-Options, X-Content-Type-Options, etc.) are configured in `vercel.json`.

---

## 4. Razorpay Configuration

1. Create a Razorpay account and get test/live API keys
2. Set `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` in environment
3. Configure webhooks in the Razorpay dashboard:
   - **URL:** `https://your-domain.com/api/payments/webhook`
   - **Events:** `payment.captured`, `subscription.activated`, `subscription.charged`, `subscription.paused`, `subscription.resumed`, `subscription.pending`, `subscription.halted`, `subscription.cancelled`, `subscription.completed`, `refund.created`, `refund.processed`, `refund.failed`
   - Refund updates reconcile saved gateway refund IDs; they never submit another refund. Test duplicate and delayed delivery, a partial refund, and full confirmation before enabling production side effects. Keep the same raw-body signature verification. A retryable `apply-error` for a known payment with no bound refund ID requires checking the saved submission response or reviewing an untracked dashboard refund; do not create another refund to clear the error. See `docs/contracts.md`.
   - **Secret:** Use the same value as `RAZORPAY_WEBHOOK_SECRET`
   - **Application:** Enable `PAYMENT_EVENTS_ENABLED=true` only for the environment whose callback has been verified. See `docs/membership-fulfillment.md` for quote binding, single-cycle billing, reconciliation, and retry contracts.
4. Create subscription plans in the Razorpay dashboard matching the `MembershipPlan` slugs (`vip-monthly`, `vip-yearly`)

---

## Request lifetime for optional work

Payment verification registers invoice generation, activity and purchase analytics
with Next.js `after` using their already-started promises. Booking email, invoice
email and the shared activity logger use the same `runSideEffect` helper. Optional
work remains attached to the request after the response, within the hosting
platform's invocation duration; payment/stock/enrollment transactions still commit
before the response. The helper never resubmits work if registration fails.

`NODE_ENV=test` or the existing `RUN_SYNC_SIDE_EFFECTS=1` flag awaits the original
promise and preserves its result/error. Without a request scope (scripts/workers),
the helper awaits the same promise and contains/logs asynchronous failure. The
shared activity helper contains its own failures in every mode. Keep critical
transactional audit writes awaited inside their transaction; they do not use this
optional helper. Generic background errors record safe types, never raw payloads.

This extends invocation lifetime, not durable delivery or provider retries. A
process crash/platform timeout can still interrupt work; invoice recovery and the
separate queue worker remain necessary. No live email delivery is established by
the tests. The HTTP lifecycle test blocks optional activity writes while confirming
payment, then checks activity/invoice/analytics persistence and retry behavior.
Browser tests must exercise the default asynchronous mode (leave
`RUN_SYNC_SIDE_EFFECTS` unset or `0`). Unit tests cover registration, fallback,
rejection and synchronous mode. No dependency/schema/config change is required;
revert the lifecycle patch and its tests/docs together to roll back.

## 5. Redis & Background Jobs (Optional)

Redis is optional. With no `REDIS_URL`, the existing notification and activity
helpers persist inline. When queues are enabled, producers do not start workers.
The default Next.js/Vercel build does not import the worker process.

1. Configure a Redis service with the BullMQ-compatible commands and persistence
   appropriate to the deployment. Do not use a customer database for tests.
2. Set `REDIS_URL` on both producers and the persistent worker process. Supported
   URIs are `redis://` and `rediss://`, with an optional percent-encoded username /
   password, port and `/database` number. TLS remains certificate-verified and
   sends SNI for DNS hosts;
   unsupported schemes, paths and query/hash options fail closed instead of
   connecting to localhost. Workers require an explicit URL.
3. Deploy the worker as a separate persistent Node process with the same
   `DATABASE_URL` and applicable email configuration:

```bash
pnpm worker
```

Ship the existing TypeScript/`tsx` toolchain with that worker process, or compile
it to JavaScript before packaging. The web build does not generate a worker
artifact or start a consumer.

Request-side producers have finite connection/command retries and a five-second
queue-operation budget. Their failed connections are discarded, and short-lived
availability checks can recover from an outage. A confirmed unavailable probe
returns the existing `false` result before submission, permitting inline fallback.
Once submission starts, a timeout/error is unconfirmed and propagates; it never
blindly invokes a second notification delivery path. Workers retain background
reconnection and existing job retry settings. Notification retries reuse their
producer ID and preserve read state.

Queued email requires a successful result with a provider message ID; disabled or
unconfirmed delivery remains failed/retryable rather than being marked complete.
Existing direct email callers still use the mail service; resolved provider error
responses or missing message IDs now report failure there too. Worker/provider logs
record safe error types, not raw errors or recipient payloads. Shutdown waits for
workers once and exits nonzero after ten seconds if the connections/jobs cannot
close. Active jobs may be retried after an interrupted worker; existing retries
are at least once. Real provider delivery and duplicate handling remain launch
acceptance, not proof supplied by queue acceptance.

`GET /api/health` preserves its existing liveness keys and database-based 200/503
status. The additive `degraded` field reports database/optional-queue errors or
failed queue records. Missing optional Redis is `unavailable`, not degraded.
Database responses use a five-second budget and a generic error; concurrent
timed-out pings share their outstanding driver query until it settles, rather
than piling up connections. The deadline does not cancel that driver query.
Redis probes have one-second connection/command timeouts and always disconnect;
queue counters have five-second operation budgets. A healthy queue counter does
not prove that a consumer is running or that a provider delivered anything.

CI verifies TLS trust/SNI, transport outages, lost replies, worker delivery and graceful exit
against disposable Redis 8 and PostgreSQL fixtures. The Redis suite is selected
explicitly after the normal PostgreSQL integration suite; no test is skipped to
accommodate a missing service. For local verification, start an isolated Redis on
loopback port 55609 (database 15), prepare the guarded PostgreSQL test database,
and run:

```bash
QUEUE_TEST_REDIS_URL=redis://127.0.0.1:55609/15 pnpm exec jest -c jest.config.ts --runInBand --testMatch '**/tests/operations/queues.redis.test.ts' --runTestsByPath tests/operations/queues.redis.test.ts
```

The test rejects remote Redis URLs, other ports/databases and credentials before
opening a connection. It uses only synthetic jobs, suppresses email credentials
in its worker process and removes its own records; it never flushes a database.
The integration step times out as a failure if setup or teardown stalls. No app
dependency, schema migration or live service provisioning is included. Revert
this queue/health change and its CI/docs together if compatibility fails.

---

## 6. Email (Optional)

1. Sign up at [Resend](https://resend.com)
2. Add and verify your sending domain
3. Set `RESEND_API_KEY` in environment variables

Without `RESEND_API_KEY`, email functions log to console instead of sending.

---

## 7. Sentry Error Monitoring (Optional)

1. Create a Sentry project (Next.js platform)
2. Set these environment variables:
   - `NEXT_PUBLIC_SENTRY_DSN` — client & server DSN
   - `SENTRY_DSN` — server-only DSN (can equal `NEXT_PUBLIC_SENTRY_DSN`)
   - `SENTRY_ORG` — organization slug (for source maps)
   - `SENTRY_PROJECT` — project slug

Source maps are uploaded automatically during build when `SENTRY_ORG` and `SENTRY_PROJECT` are set.

---

## 8. Blob Storage (Optional)

Product photos use a public Vercel Blob store. Connect the existing store to the
project with OIDC, Preview only, and custom prefix `PRODUCT_IMAGES_BLOB`; leave
the read-write-token option unchecked. Scope the generated
`PRODUCT_IMAGES_BLOB_STORE_ID` and `PRODUCT_IMAGES_BLOB_WEBHOOK_PUBLIC_KEY` variables
to `codex/site-completion-release`. The upload route explicitly uses the dedicated
store ID and obtains a refreshed short-lived identity with `@vercel/oidc` for each
request. The webhook public key is connection metadata; this route does not need
a webhook. Use a separate connection for a later production rollout. Uploads accept
JPEG, PNG and WebP up to 4 MiB each, with format-signature validation and generated
object names. The gallery permits eight images. This leaves multipart overhead
below Vercel's request limit. A missing binding/identity returns 503 and keeps the draft.

An explicit server-only `PRODUCT_IMAGES_BLOB_READ_WRITE_TOKEN` remains supported
for token-based deployments or when dedicated OIDC identity is unavailable.
`BLOB_READ_WRITE_TOKEN` remains a legacy product-upload fallback only when no
dedicated store ID is configured, and controls existing invoice PDF uploads.
A configured dedicated store never falls back to that shared invoice token.
Do not set the shared key merely to enable product
photos: the current invoice hosting/redirect contract needs a separate privacy
review. A dedicated product-photo connection does not enable invoice uploads. No upload
credential belongs in a `NEXT_PUBLIC_` variable or Git. Native store provisioning
may return credentials; save them directly as scoped Vercel Secrets without
printing or persisting them locally.

---

## 9. Cron Jobs

The deployment configuration supports the current Hobby plan's daily scheduling limit:

| Endpoint | Schedule (UTC) |
| --- | --- |
| `/api/cron/booking-reminders` | Daily, 09:00 hour |
| `/api/cron/quiz-followup` | Daily, 06:00 hour |
| `/api/cron/abandoned-cart` | Daily, 12:00 hour |
| `/api/cron/aggregate-funnel` | Daily, 00:00 hour |
| `/api/cron/cleanup-events` | Sunday, 03:00 hour |

Hobby execution can occur anywhere within the scheduled hour. Quiz/cart age thresholds determine eligibility; messages are sent at a later batch run, so they are not guaranteed at the one-hour or 24-hour threshold. Each endpoint currently processes at most 50 eligible records per run; monitor backlog and provider failures. A scheduler supporting more frequent invocation is needed before promising hourly delivery. See [Vercel scheduling limits](https://vercel.com/docs/cron-jobs/usage-and-pricing).

All endpoints require `CRON_SECRET`; Vercel sends it as a Bearer authorization header. Preview deployments do not execute Vercel's production cron jobs. Keep Preview notification/email providers separate from live customer delivery.

---

## 10. Post-Deployment Checklist

- [ ] Verify database migrations are applied (`prisma migrate deploy`)
- [ ] Seed initial data if needed (`pnpm seed`)
- [ ] Create an admin user (`pnpm tsx scripts/create-admin.ts admin@example.com`)
- [ ] Test the health endpoint: `GET /api/health`
- [ ] Configure Razorpay webhooks pointing to production URL
- [ ] Verify payment flow end-to-end with Razorpay test mode
- [ ] Set `NEXT_PUBLIC_ROBOTS="production"` to allow search engine indexing
- [ ] Set `NEXT_PUBLIC_SITE_URL` to your production domain
- [ ] Enable Sentry alerts for error monitoring
- [ ] Review security headers in browser DevTools

---

## Custom Server (Socket.IO)

For real-time notifications via Socket.IO, use the custom server instead of the default Next.js server:

```bash
pnpm start:custom
```

This runs `server.ts` which integrates Socket.IO with the Next.js HTTP server. On Vercel, Socket.IO falls back to polling automatically.

---

## Rollback

Vercel supports instant rollback to any previous deployment from the dashboard. For database rollbacks, keep migration SQL files and test reversal scripts in development before applying to production.
