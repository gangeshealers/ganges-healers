# Ganges Healers — Holistic Wellness Marketplace

Next.js 15.5, React 19, Prisma/PostgreSQL, and Auth.js application for healing services, practitioner bookings, guided programs, courses, audio, community, and wellness products.

### Current development release branch

The latest integrated application is maintained on **`codex/site-completion-release`**, not the older `main` or historical feature branches. For an existing **clean** checkout in Windows Git Bash or another terminal:

```bash
git status
git fetch origin --prune
git switch codex/site-completion-release || git switch --track origin/codex/site-completion-release
git pull --ff-only origin codex/site-completion-release
pnpm install --frozen-lockfile
```

If you have local edits or commits, preserve them first with a backup branch, commit or stash; do not force-switch over your own work. The release branch is a development candidate, **not a production launch approval**.

> Project roadmap: See docs/IMPLEMENTATION_PLAN.md for the 24-week implementation plan and sprint breakdown.
> Engineering process: See docs/GUARDRAILS.md for change management and contribution rules.
> Contracts & Invariants: See docs/contracts.md for pinned API/logging/DB/env contracts and Patch Plan template.
> Authentication: See docs/AUTH_IMPLEMENTATION.md for NextAuth setup and testing guide.
> Blog publishing: See [docs/blog-publishing.md](docs/blog-publishing.md) for admin drafts, review, publication, and withdrawal.
> Notifications: See [docs/notifications.md](docs/notifications.md) for the member inbox, read controls, optional Redis delivery, and authenticated real-time updates.
> Navigation: See [docs/navigation.md](docs/navigation.md) for live search, session/role shortcuts, verified sign-out, mobile controls, and cart access.
> Analytics: See docs/analytics.md for the client-only analytics shim and events.
> SEO: See docs/seo.md for canonical URLs, Breadcrumbs & JSON-LD components.
> Sitemap: Generated via app/sitemap.ts using a helper that outputs canonical URLs only; see docs/seo.md.
> Robots: Served via app/robots.ts; see docs/seo.md.

## Tech Stack

- **Framework:** Next.js 15.5 with App Router
- **Language:** TypeScript
- **Styling:** Tailwind CSS
- **UI Components:** shadcn/ui
- **Database:** PostgreSQL with Prisma ORM
- **Authentication:** NextAuth.js with Google OAuth & Credentials
- **Form Management:** React Hook Form with Zod validation
- **Date Utilities:** date-fns
- **HTTP Client:** Axios
- **Toast Notifications:** Sonner

## Features

- 🔐 **Authentication System**
  - Google OAuth integration
  - Credentials-based login
  - Role-based access control (USER/ADMIN)
  - Session management
  - Appointment booking system
  - Patient dashboard
  - Medical records management

- 🎨 **Modern UI/UX**
  - Responsive design with Tailwind CSS
  - Accessible UI components from shadcn/ui
  - Dark/light mode support
  - Toast notifications

- 📊 **Dashboard Features**
  - Patient overview
  - Appointment management
  - Medical records access
  - Profile management

## Getting Started (development only)

### Requirements

- Node.js 20 or newer; Corepack and the package's pinned pnpm version
- Access to a **separate development** PostgreSQL/Neon branch, distinct from production
- Optional providers (Google OAuth, Razorpay, email, Redis and uploads) configured only when testing their respective workflows

### Safe setup

1. Open the repo directory and install the lockfile's exact dependencies:

   ```bash
   corepack enable
   pnpm install --frozen-lockfile
   ```

2. Create a **local, Git-ignored** `.env` file. The repository does not ship `.env.example`. Supply your own secrets; never copy credentials from an untrusted example or commit `.env`:

   ```dotenv
   DATABASE_URL="postgresql://<dev-user>:<dev-password>@<isolated-development-host>/neondb?sslmode=require"
   AUTH_SECRET="<random-long-secret-for-local-development>"
   NEXTAUTH_URL="http://localhost:3000"
   ```

   The `DATABASE_URL` host **must** belong to your intended, isolated development database. Verify the actual branch in Neon before applying schema changes. Do not paste this connection string into tickets or chat.

3. Inspect missing migrations **without changing any data**:

   ```bash
   pnpm exec prisma migrate status
   ```

   If migrations are pending and you have verified the database is the isolated development branch, apply the committed migrations:

   ```bash
   pnpm exec prisma migrate deploy
   pnpm exec prisma generate
   ```

4. Catalog content is database-driven. Preview the guarded sample catalog setup, then decide whether to add example data to the isolated development database. **Do not use the full `pnpm seed` command for public catalog restoration**—it creates demo accounts and financial records. See [catalog seeding](docs/catalog-seeding.md).

   ```bash
   pnpm seed:catalog
   ```

5. Start the local server:

   ```bash
   pnpm dev
   ```

   Open http://localhost:3000. Optional providers may log configuration notices; see [implementation contracts](docs/contracts.md) before treating a paid/authenticated workflow as launch-ready.

## Public sample catalog for local development

The catalog pages use database records, not hard-coded listings. To restore the 10 example services, 6 programs and 8 courses on an isolated development database without creating demo users or payments, use the guarded **`pnpm seed:catalog`** command. It starts as a dry run and requires an exact hostname confirmation before writing. See [docs/catalog-seeding.md](docs/catalog-seeding.md) for instructions, branch-safety requirements, and the distinction from the full `pnpm seed` fixture.

## Safe test database setup

`pnpm test:unit` runs without database credentials, reset, or seed. Integration
tests use `jest.integration.config.ts`; all test reset/seed paths verify the
dedicated target before changing data. Keep `.env.test` Git-ignored, with exactly
one active `DATABASE_URL` for `ganges_healers_test` and `TEST_DATABASE_HOST` set to
that URL's direct, unpooled hostname. Test hosts must differ from production hosts
in `.env`, `.env.local`, `.env.production`, and `.env.production.local`.

Use `pnpm db:test:push`, `pnpm db:test:seed`, or `pnpm test:int` after configuration.
Each database command first checks `current_database()` in a separate process.
Missing, ambiguous, production, or misrouted settings fail closed without logging
connection strings. CI may use an isolated loopback database named
`ganges_healers_test` without a private environment file. `pnpm dev:test` performs
the same checks before preparing data and starting the E2E server on port 3010
with Turbopack, matching the application's development and production build
commands. CI retains browser failure screenshots, video, and error context for
three days.

## Available Scripts

- `pnpm dev` — Next.js Turbopack development server.
- `pnpm build` — production build and associated Next.js checks.
- `pnpm exec prisma migrate status` — read-only migration status.
- `pnpm exec prisma migrate deploy` — apply committed migrations **only after confirming the target database**.
- `pnpm seed:catalog` — guarded, dry-run public sample catalog setup.
- `pnpm seed` — full **demo/test fixtures** including accounts; never run against real customer data.
- `pnpm test:unit`, `pnpm test:ui`, `pnpm test:integration`, `pnpm test:e2e` — dedicated verification suites.

## Database Schema

The application uses the following main models:

- **User** - User accounts with authentication
- **Account** - OAuth account linking
- **Session** - User sessions
- **VerificationToken** - Email verification tokens

### Admin accounts and credentials

Do not rely on sample passwords or demo users from `prisma/seed.ts` in any shared or production environment. Create an administrator through the reviewed administrative provisioning workflow, with a unique strong password, and enforce your normal role/access controls. A public repository example password is **not** a safe login credential.

### Administrator workspaces

The administrator dashboard and account menu link to the existing services,
healers, courses/lessons, audio, products, programs/enrollments, community,
articles, payments and analytics workspaces. Their server-side administrator
checks remain required; navigation does not grant access to another role.

## Project Structure

```
ganges-healers/
├── src/
│   ├── app/                    # App Router pages
│   │   ├── api/               # API routes
│   │   ├── auth/              # Authentication pages
│   │   ├── dashboard/         # Dashboard pages
│   │   ├── services/          # Services pages
│   │   ├── layout.tsx         # Root layout
│   │   └── page.tsx           # Homepage
│   ├── components/            # Reusable components
│   │   ├── ui/               # shadcn/ui components
│   │   ├── navbar.tsx        # Navigation component
│   │   └── providers.tsx     # Context providers
│   ├── lib/                  # Utility libraries
│   │   ├── auth.ts          # NextAuth configuration
│   │   ├── prisma.ts        # Prisma client
│   │   └── utils.ts         # Utility functions
│   └── types/               # TypeScript type definitions
├── prisma/
│   ├── schema.prisma        # Database schema
│   └── seed.ts             # Database seeding script
├── public/                 # Static assets
└── package.json           # Dependencies and scripts
```

## Authentication

The app supports two authentication methods:

1. **Google OAuth** - Requires GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET
2. **Credentials** - Email/password authentication with bcrypt hashing

## Deployment and database cutover

The live `main` branch and `codex/site-completion-release` are distinct; merging and production promotion require explicit release acceptance. The release Preview database may differ from your local Neon development branch.

Before deployment, confirm the target Vercel environment has its own `AUTH_SECRET`, `DATABASE_URL`, and any enabled provider credentials. Inspect that environment's branch-specific variables without revealing their values.

**Do not** use `pnpm prisma:migrate` (which invokes development migration creation) against production. Production migrations require a separately reviewed cutover and the committed `pnpm exec prisma migrate deploy` command, pointed at the explicitly verified database. Check provider acceptance, background workers, real payments/webhooks, transactional notifications, content approval, and private/role-gated routes before promotion.

See [contracts](docs/contracts.md), [guardrails](docs/GUARDRAILS.md), and the release PR for readiness gates.

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

Review the repository's licensing terms with the project maintainers before external redistribution; no standalone license file is currently bundled.

## Support

For support and questions:
- Create an issue in the GitHub repository
- Contact the development team

---

Built with ❤️ using Next.js 15.5 and modern web technologies.

## Accessibility

We ship with sensible, test-backed accessibility defaults:

- Landmarks: a visible-on-focus Skip to main link and a main region with id="main-content" for quick keyboard navigation.
- Breadcrumbs: rendered inside nav aria-label="Breadcrumb" with aria-current="page" on the last item; separators are aria-hidden.
- Empty states: announced via role="status" and aria-live="polite" with a proper heading for context.
- Modal dialogs: explicit role="dialog" and aria-modal="true", titled via aria-labelledby pointing to DialogTitle; focus is trapped, first control is focused on open, and ESC/close restores prior focus.
- Focus visibility: a reusable focus-ring utility class applied to primary links and buttons for strong, consistent outlines.
- CTA semantics: anchors for navigation, buttons for actions (with type="button" where appropriate), no onClick on non-interactive elements, and labels for icon-only buttons.

These behaviors are covered by unit/UI tests (including jest-axe checks) to prevent regressions.

## Admin Payments Dashboard

The admin analytics dashboard (`/admin/payments`) provides revenue and refund insights across key payment domains.

### Metrics (All values in paise unless formatted in UI)

- Gross: Sum of successful payment amounts in range (`Payment.statusEnum = SUCCESS`).
- Refunds: Sum of refund amounts (`Refund.amountPaise`) whose `createdAt` is within range (refunds do not reduce Gross; they affect Net only).
- Net: Gross − Refunds.
- Payments Count: Number of successful payments in range.
- Refunds Count: Number of refunds in range.
- AOV: Gross / Payments Count (0 if count is 0).
- MRR (Normalized): For each active VIP membership: add full monthly plan price; add yearly plan price / 12 (rounded). Computed from `VIPMembership.status=active` joined to `MembershipPlan.interval`.

### Breakdown & Top Programs

- byType: Stable keys: `SESSION`, `PROGRAM`, `MEMBERSHIP`, `STORE`, `COURSE` (0-filled if absent).
- topPrograms: Up to 5 highest grossing PROGRAM payments (metadata.programId) with fields `{ programId, title, grossPaise }`.

### Endpoints (Admin Guarded)

All endpoints require the caller to be an ADMIN; non-admin receives 403 `{ error: "Forbidden: admin only" }`.

1. `GET /api/admin/payments/metrics?from=YYYY-MM-DD&to=YYYY-MM-DD&type=ALL|SESSION|PROGRAM|MEMBERSHIP|STORE|COURSE`
   Response:
   ```json
   {
     "range": {"from":"2025-08-29","to":"2025-09-27"},
     "kpi": {"grossPaise":0,"refundsPaise":0,"netPaise":0,"paymentsCount":0,"refundsCount":0,"aovPaise":0,"mrrPaise":0},
     "byType": {"SESSION":0,"PROGRAM":0,"MEMBERSHIP":0,"STORE":0,"COURSE":0},
     "topPrograms": [ {"programId":"...","title":"...","grossPaise":0} ]
   }
   ```
2. `GET /api/admin/payments/timeseries?from=YYYY-MM-DD&to=YYYY-MM-DD&type=...` (interval fixed to daily for MVP)
   Returns array of contiguous days: `[{"date":"YYYY-MM-DD","grossPaise":0,"refundsPaise":0,"netPaise":0,"byType":{"SESSION":0,"PROGRAM":0,"MEMBERSHIP":0,"STORE":0,"COURSE":0}}]` (zero-filled).
3. `GET /api/admin/payments/latest?limit=20&type=...` Returns recent successful payments with `{ id, createdAt, amountPaise, type, source, userId }`.
4. `GET /api/admin/payments/refunds?from=YYYY-MM-DD&to=YYYY-MM-DD&limit=20` Returns recent refunds `{ id, paymentId, amountPaise, createdAt }`.

### Filters & Range Behavior

- Default range: last 30 days (inclusive) when no params supplied.
- Range boundaries use ISO date (UTC) day slices.
- Type filter defaults to `ALL`. When specified, metrics/timeseries/latest restrict to that `Payment.type`. Refunds endpoint is unaffected by `type` (refunds not strongly typed by original payment type in response).

### UI Features

- KPI cards (Gross, Refunds, Net, Payments, Refunds Count, AOV, MRR) with INR formatting.
- Net Revenue Line Chart (daily netPaise).
- Stacked Gross by Type Bar Chart (SESSION/PROGRAM/MEMBERSHIP/STORE/COURSE).
- Recent Payments & Refunds tables (sortable by date/amount) with source pill (Program / Booking / Membership) and partial IDs.
- Skeleton loading states, empty states, toast errors on fetch (`[admin][payments][ui_error]`).

### Logging & Observability

Server endpoints log: `[admin][payments][metrics|timeseries|latest|refunds] { from,to,type,limit?,ms }` and `[slow]` variant if `ms > 400`.
Client fetch wrapper logs `[admin][payments][ui_fetch]` and errors log `[admin][payments][ui_error]` without PII.

### Log Samples (Non-PII)

```
[admin][payments][metrics][slow] { from: '2025-08-29', to: '2025-09-27', type: 'ALL', ms: 8042 }
[admin][payments][timeseries][slow] { from: '2025-08-29', to: '2025-09-27', type: 'SESSION', ms: 1364 }
[admin][payments][latest][slow] { limit: 20, type: 'ALL', ms: 6620 }
[admin][payments][refunds][slow] { from: '2025-08-29', to: '2025-09-27', limit: 20, ms: 4219 }
[invoice][generate][created] { paymentId: 'cmg26ir2e000xuk90t0wbv20i', invoiceNumber: 'INV-20250927-4BBE7D', pdf: false }
[invoice][generate][upload_skipped_no_token] { paymentId: 'cmg26ir2e000xuk90t0wbv20i' }
[auth][admin][bypass_test_mode]   # (CI / e2e ONLY; never present in Preview/Production)
```

These examples illustrate typical performance and lifecycle logging. Any `[slow]` tag highlights handlers exceeding the 400ms threshold. The bypass line only appears when `TEST_MODE=1` (restricted to local/CI).

### TEST_MODE (CI / E2E Only)

`TEST_MODE=1` activates an automated admin bypass used solely in Playwright / CI environments to avoid full auth flows. When enabled the server logs a structured line `[auth][admin][bypass_test_mode]` on each admin guard invocation. This MUST NEVER be set in production or preview environments. Deployment pipelines should explicitly unset `TEST_MODE`.

### Assumptions / Data Sources

- Success is determined via `Payment.statusEnum = SUCCESS` (ignore legacy `Payment.status`).
- Refunds reduce Net only; Gross remains a pure measure of captured revenue.
- MRR does not prorate partial months; yearly plans normalized by simple division by 12.
- All monetary values are persisted in paise (integer) and formatted to INR client-side.

### Seed Data (Dev Convenience)

Seed script includes core users/healers/services. For richer analytics, extend with sample Payments / Refunds (see `prisma/seed.ts`). Add monthly & yearly active memberships for non-zero MRR.

### Future Enhancements

- Weekly/monthly aggregation modes.
- Export (CSV) of payments/refunds.
- Program revenue attribution by enrollment date.
- Performance indexes (compound on `(statusEnum, createdAt)` if needed at scale).

## VIP Memberships (Razorpay Subscriptions)

The platform supports a VIP membership via Razorpay Subscriptions providing recurring benefits.

### Plans & Mapping

Create plans in Razorpay (Test Mode):
- Monthly (199.00 INR) -> store returned `plan_id` in `MembershipPlan.razorpayPlanId`
- Yearly (1,990.00 INR) -> store returned `plan_id`

Insert (or update) rows in `MembershipPlan` with:
```
slug: monthly-vip | yearly-vip
title: "Monthly VIP" | "Yearly VIP"
pricePaise: 19900 | 199000
interval: MONTHLY | YEARLY
razorpayPlanId: <dashboard plan_id>
benefits JSON example: { "freeSessions": 2, "priorityBooking": true, "discountPct": 10 }
```

### Endpoints

POST /api/memberships/subscribe
Body: { planSlug }
Response: { subscriptionId, membershipId }
Guards: blocks if user already has pending/active membership (409).

GET /api/memberships/plans
Response: { plans: [ { slug, title, pricePaise, interval, benefits } ] }

GET /api/memberships/me
Response: {
   membership: { id, status, startDate?, nextBillingAt?, endDate?, plan: { title, pricePaise, interval } } | null,
   credits: { total }
}

### Webhook Events (Razorpay → /api/payments/webhook)

Required events:
- subscription.activated → membership active + benefits grant (idempotent)
- subscription.paused → status=paused
- subscription.halted → status=halted
- subscription.cancelled → status=cancelled, cancelledAt set
- (Existing) payment.captured / payment.failed / refund.processed remain supported for other domains.

Signature validation uses `RAZORPAY_WEBHOOK_SECRET` with HMAC SHA256 over raw body. HMAC mismatch logs a warn including the event type.

### Benefits Provisioning Policy (MVP)

- Free session credits granted once on first activation for the membership (no per-billing-cycle accumulation yet).
- No expiry (credits do not currently expire).
- Re-activation within the same billing cycle does NOT grant extra credits.
- User `vip` flag set to true upon first activation.

### UI Flow (/dashboard/membership)

1. User visits membership page.
2. If no active/pending membership: fetch plans, display cards, user selects Subscribe.
3. App calls `POST /api/memberships/subscribe`, obtains subscriptionId, triggers Razorpay Checkout (subscription mode).
4. Page shows pending state and polls `GET /api/memberships/me` every ~4s up to 60s.
5. On `subscription.activated` webhook, polling detects status=active → shows success + credits.

### Local Test Steps

1. Ensure env vars set: RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET, NEXT_PUBLIC_RAZORPAY_KEY_ID.
2. Create test plans in Razorpay and update MembershipPlan rows (or seed them).
3. Start dev server.
4. Subscribe via UI; in Razorpay dashboard (or mock), trigger / resend activation webhook.
5. Verify `/api/memberships/me` returns active status & credits.

### Observability

Structured logs emitted:
```
[membership][subscribe][created]
[membership][subscribe][blocked_duplicate]
[membership][activated]
[membership][benefits_granted]
[membership][benefits_skipped]
[membership][paused]
[membership][halted]
[membership][cancelled]
[membership][idempotent]
```

### Future Enhancements (Post-MVP)
- Per-cycle credit accrual & expiry.
- Proration and mid-cycle upgrades.
- Email notifications on state changes.
- Membership downgrades / plan switching.


## Production Environment Variables (Quick Reference)

The application loads most configuration from process.env. Missing Razorpay keys no longer crash the build; the order route returns a 500 with a descriptive error.

```
# Core
NEXTAUTH_URL=https://your-domain.example
AUTH_SECRET=<64-hex-random>
DATABASE_URL=postgresql://user:pass@host:5432/db?sslmode=require

## Developer Docs

- Ops Checklist: see `docs/ops-checklist.md`
- Payments and memberships contracts: see `docs/payments.md`
- Invoices contracts and generator behavior: see `docs/invoices.md`

Local webhook simulator (uses raw HMAC with your local secret):

```
pnpm simulate:webhook
```

# Payments (optional but required for Razorpay flow)
RAZORPAY_KEY_ID=rzp_live_xxx
RAZORPAY_KEY_SECRET=xxx
RAZORPAY_WEBHOOK_SECRET=<random>

# OAuth (optional)
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...

# Redis (optional caching layer)
REDIS_URL=rediss://...
```

If Razorpay variables are absent:
- Booking creation still works for VIP / credits flows.
- Generic payment creation endpoint returns `{ error: "Payment gateway unavailable" }` (HTTP 500) without affecting other routes.

### Generic Payments Flow

New unified endpoints:

POST /api/payments/create-order
- Booking: provide bookingId
- Generic: provide type + amountPaise
- Exclusive: must supply exactly one of bookingId or type
- Returns: orderId, amountPaise, currency, key, paymentId

POST /api/payments/verify
- Body: { orderId, paymentId: gatewayPaymentId, signature }
- Idempotent success returns idempotent=true on repeat

POST /api/payments/webhook
- Validates x-razorpay-signature over raw body
- Handles payment.captured, payment.failed, refund.processed
- Full refund => statusEnum REFUNDED

Client helper: `openRazorpayCheckout` in `src/lib/payments/openRazorpayCheckout.ts`.

Legacy route `/api/payments/razorpay/order` has been removed (previously gated by ENABLE_LEGACY_RAZORPAY_ORDER). Use `/api/payments/create-order` instead.

Add indexes (optional hardening): see future migration suggestion for booking status + service indexing and partial unique index on Payment.paymentId where status='success' for idempotency.

<!-- Invoices & Billing section appended -->
## Invoices & Billing

Automated invoices are generated for each successful non-zero payment and surfaced via `/dashboard`, `/dashboard/membership`, and `/dashboard/billing`.

Key endpoints: `POST /api/invoices/generate`, `GET /api/invoices/[paymentId]`, `GET /api/invoices/me`.

Generation triggers: payment verify + `payment.captured` webhook (idempotent), or manual generate.

Env: `BLOB_READ_WRITE_TOKEN` (Vercel Blob), `RESEND_API_KEY` (emails). Missing blob token logs `[upload_skipped_no_token]` and leaves `pdfUrl` empty until regenerated.

Structured logs use prefix `[invoice][generate]` with final `[created]` tag on success.

Admin backfill: `POST /api/admin/invoices/backfill` `{ chunkSize?, dryRun? }` to create invoices for historical successful payments lacking one.

Test locally: complete a test payment, view `/dashboard/billing`, call generate endpoint twice → second shows idempotent; replay webhook for idempotency validation.
