# Release completion matrix — Ganges Healers

**Status date:** 13 November 2026
**Source of requirements:** [Implementation Plan](./IMPLEMENTATION_PLAN.md) (September 2025), [release PR #10](https://github.com/gangeshealers/ganges-healers/pull/10), [deployment guide](./deployment.md), [operations checklist](./ops-checklist.md), and [database rehearsal](./database-rehearsal.md).  
**Integration branch:** `codex/site-completion-release`; **production branch:** `main`.

## How to interpret this matrix

This is an evidence-oriented release backlog, not a percentage-complete claim. The original implementation plan calls for 12 sprints / 24 weeks but only details Sprints 1–4; Sprint 5 contains a continuation placeholder and Sprints 6–12 have no acceptance breakdown. The plan's ✅ deliverable markers are not live-environment verification. Its AWS/microservice diagrams are an initial proposal, whereas the implemented application deploys Next.js on Vercel with PostgreSQL/Neon and optional external workers. Rebuilding equivalent already-working features just to match the draft architecture would increase release risk.

Definitions:
- **Implemented, needs acceptance:** present in the release branch and covered by automated tests; not certified on deployed Preview or with a real provider.
- **Open code:** focused changes in open pull requests; not yet part of the release.
- **External/owner dependency:** requires approved content, credentials, provider access, operational deployment, or authorization outside the source tree.
- **Blocked:** release must not proceed until the stated check passes.

## Work already implemented in the release branch

| Plan capability | Implementation evidence | Remaining acceptance |
| --- | --- | --- |
| Authentication/account lifecycle | Registration, sign-in, Google OAuth configuration, password recovery, email/phone verification, MFA and account closure; see [release PR #10](https://github.com/gangeshealers/ganges-healers/pull/10) and [auth guide](./AUTH_IMPLEMENTATION.md) | Multi-role authenticated Preview test; verify real email/SMS and Google OAuth callbacks before enabling providers |
| Service discovery / healers / booking | Service catalog, search, live availability, slot conflict prevention, booking ownership, confirmation, reschedule/cancellation, funded delivery; [booking verification](./booking-verification.md) | Run real customer↔healer journeys, timezone and recovery checks on exact Preview revision |
| Payments, programs, memberships | Razorpay integration, signed callbacks, idempotent verification, invoices, enrollment, courses, membership access; [payments guide](./payments.md) | Test-mode provider callback/capture/refund and email delivery; never assume mocked payment acceptance is live |
| Store / customer order management | Active catalog visibility, stock/fulfilment, shopping cart, saved-order recovery, customer/admin histories; [ops checklist](./ops-checklist.md) | Owner-approved products, prices, stock and shipping; test one safe provider lifecycle |
| Community, audio, blog, support | Topic/moderation, feed, audio publish/access, blog publication, support queues; [release PR #10](https://github.com/gangeshealers/ganges-healers/pull/10) | Accepted publication/content and role-based deployment checks |
| Admin / practitioner operations | Catalog editing, member lookups, booking/payment views, practitioner calendar/history, launch inspection and booking-email reconciliation; [ops checklist](./ops-checklist.md) | Staff walkthrough, review permissions, stale-write and recovery behavior |
| Infrastructure and quality gates | GitHub CI, PostgreSQL integration, UI/unit/security/build and Playwright suites, Vercel Preview, database migration rehearsal | Exact merged revision full-green; protected Preview delivery acceptance and production rehearsal remain separate |


**Latest merged development checkpoint (13 November 2026)** — `e59bdda` integrates the member dashboard in [PR #137](https://github.com/gangeshealers/ganges-healers/pull/137), following dashboard moderation #133 and admin support navigation #134.

## Priority P0 — finish and validate the code

### Completed development integrations (not live acceptance)

- [x] **Restore repeatable E2E CI.** [PR #114](https://github.com/gangeshealers/ganges-healers/pull/114) merged Chromium install/startup repair; subsequent seven-job runs, including Playwright, passed. This is CI evidence, not production acceptance.
- [x] **Integrate catalog hydration, bounded community paging, support queue search and healer directory sorting.** The individual early review branches [#112](https://github.com/gangeshealers/ganges-healers/pull/112), [#113](https://github.com/gangeshealers/ganges-healers/pull/113), [#110](https://github.com/gangeshealers/ganges-healers/pull/110), and [#109](https://github.com/gangeshealers/ganges-healers/pull/109) were closed unmerged; their reviewed functionality was integrated through verified [PR #116](https://github.com/gangeshealers/ganges-healers/pull/116). Do not reopen the superseded branches.
- [x] **Publish-gated public pages, catalog visibility, stock controls, and truthful admin publication inventory.** Integrated through [#117](https://github.com/gangeshealers/ganges-healers/pull/117), [#118](https://github.com/gangeshealers/ganges-healers/pull/118), [#119](https://github.com/gangeshealers/ganges-healers/pull/119), [#120](https://github.com/gangeshealers/ganges-healers/pull/120), and [#124](https://github.com/gangeshealers/ganges-healers/pull/124); content/legal review remains external.
- [x] **Protected service image editing, opt-in marketing consent, logout robustness and public image fallbacks.** Integrated via [#125](https://github.com/gangeshealers/ganges-healers/pull/125), [#127](https://github.com/gangeshealers/ganges-healers/pull/127), [#128](https://github.com/gangeshealers/ganges-healers/pull/128), [#129](https://github.com/gangeshealers/ganges-healers/pull/129) and [#122](https://github.com/gangeshealers/ganges-healers/pull/122). Missing service photos still require licensed/owner-approved media.
- [x] **Public service sorting, delivery format discovery and private member support search.** Integrated via [#130](https://github.com/gangeshealers/ganges-healers/pull/130), [#131](https://github.com/gangeshealers/ganges-healers/pull/131) and [#132](https://github.com/gangeshealers/ganges-healers/pull/132), all with exact-head seven-job CI including browser tests.

### Still open — requires fresh evidence

- [x] **Dashboard moderation and admin support navigation.** [#133](https://github.com/gangeshealers/ganges-healers/pull/133) and [#134](https://github.com/gangeshealers/ganges-healers/pull/134) passed their existing complete CI runs and merged into development.
- [x] **Member dashboard.** Direct course continuation, purchased program progress and account workspace navigation merged in [PR #137](https://github.com/gangeshealers/ganges-healers/pull/137). See [dashboard behavior](./dashboard-upcoming-bookings.md).
- [ ] **Exact-release CI checkpoint.** After intended changes merge, run all seven jobs on the combined `codex/site-completion-release` head, including full Playwright, not a previous green SHA. Preserve `main` until separately approved.
- [ ] **Accessible cross-role Preview acceptance.** Obtain an exact-head READY protected release Preview, then exercise anonymous/customer/practitioner/admin journeys, mobile sign-out, sensitive permissions, booking/payment recovery and content publication. An older READY Preview is not sufficient.
- [ ] **Deployment and email-recovery contract.** [Draft #123](https://github.com/gangeshealers/ganges-healers/pull/123) adds a Vercel Schedules beta path target, but authentication header delivery on beta HTTP-path schedules is not yet proven. Keep it unmerged and disabled until Preview shows a protected invocation, owner approves automatic sends, and provider/reconciliation checks pass. Superseded legacy Cron PR #88 is closed unmerged.

## Priority P1 — content and verified integrations

- [ ] **Owner-approved catalog and publication.** Last read-only Preview audit recorded seven active services, five active verified healers, and no active products/courses/programs or published audio. Re-run counts on the intended launch dataset. Obtain approval for products, inventory, pricing, teaching materials, imagery/rights, program schedules, practitioner credentials and editorial copy. Do not publish sample seed data as real merchandise or paid curriculum. [Catalog seeding restrictions](./catalog-seeding.md).
- [ ] **Razorpay test-mode provider acceptance.** Securely configure Preview credentials and callback URLs; verify capture, duplicate/delayed webhook, uncertain-result recovery and refund reconciliation with provider records. Do not exercise live charges during CI.
- [ ] **Transactional email and SMS acceptance.** Confirm actual provider acceptance IDs, delivery/bounces, account recovery, verification, booking notifications and retry reconciliation. No fixture result is live delivery evidence.
- [ ] **OAuth, uploads, invoices, meetings.** Verify configured stable callback origin, permission and identity isolation, licensed media uploads/downloads, invoice retrieval and actual meeting-link lifecycle without exposing private URLs.
- [ ] **Background consumer/recovery.** Deploy a persistent Redis-backed worker where needed, or approve/configure an authenticated booking-email recovery scheduler. The code has a guarded `/api/cron/booking-emails` endpoint, but the proposed Vercel Schedules beta invocation is still draft [#123](https://github.com/gangeshealers/ganges-healers/pull/123), not activated or proven to send authenticated requests; do not treat it as operating continuously. Verify outbox retry, duplicate provider outcomes, and PENDING/REVIEW triage. [Deployment instructions](./deployment.md).

## Priority P1 — operational release gate

- [ ] **Schema and data migration.** Independently rehearse a current production snapshot against all tracked migrations, compare row counts and fingerprints, and review the changed dataset. [Database rehearsal](./database-rehearsal.md) records earlier safe copies; it is not a completed production cutover.
- [ ] **Observability and recovery.** Configure health/degraded monitoring, Sentry/alerting, audit access, queue/cron status, provider failure alerts, backups, restore drills, and escalation contact; exercise safe rollback/reconciliation.
- [ ] **Performance and accessibility.** Measure Core Web Vitals and route timings on the actual deployment; run mobile, keyboard/screen-reader and reasonable load checks with realistic catalog sizes. Save evidence.
- [ ] **Business/legal/customer acceptance.** Verify real catalogue copy, refund/service policies, contact/support handling, consent and production terms/privacy with the responsible owner. Help Center FAQs are not a substitute for a legal review.
- [ ] **Controlled launch.** Approve exact commit and configuration, freeze writes during planned cutover, validate data and provider environments, update production domain/DNS only after explicit authorization, then perform post-deploy smoke and monitoring.

## Execution order and decision rules

1. Merge proven CI recovery; integrate outstanding PRs with explicit head-SHA checks and all-green exact-revision evidence.
2. Re-run the role-based protected Preview journeys and capture test/provider outcomes. Fix only defects found.
3. Populate the reviewed live catalog and confirm external service configuration in isolated Preview with the owner.
4. Complete worker/scheduler and migration/recovery drills. Document actual readiness, not credential presence.
5. Obtain explicit owner approval before any production promotion, database cutover, live payments/messages or DNS change.

**Non-goals for this release:** unapproved sample commercial content, automatic mass email/refund replays, a speculative AWS/Kubernetes rewrite, fabricated provider verification, or asserting complete production readiness from a passing build alone.

## Tracking updates

Update a checkbox only with a link to the exact passing CI run, deployment acceptance record, signed-off content inventory, provider receipt/test evidence (without sensitive values), or a relevant merged PR. Keep deployment and irreversible financial operations behind explicit approvals. Every code change follows [repository guardrails](./GUARDRAILS.md), including focused patches, tests and rollback notes.
