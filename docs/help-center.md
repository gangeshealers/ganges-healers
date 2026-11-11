# Public Help Center

Route: `/help`. The Help Center is a static, browser-filterable set of FAQs linked from the site footer. Visitors can search answers and select a topic without submitting personal information or search terms to an API. The FAQ uses normal HTML disclosures and accessible category buttons.

## Grounding and policy

- Session cancellation band calculations come from `src/lib/bookings/refund-policy.ts`: full at 48+ hours, half at 24–48 hours, none under 24 hours. Real cash refunds depend on the recorded successful capture/provider state and may need support review; the page does **not** promise an instant or automatic refund.
- Rescheduling is offered at least 24 hours before the scheduled session via `/dashboard/bookings` when that specific booking is eligible.
- Store order recovery follows `docs/payments.md`: review an owned saved order before opening another payment attempt; pending orders may offer Continue payment. A provider capture without verified fulfillment requires review.
- Learning, programs, audio, membership, and settings information links only to existing app routes. The FAQ does not confer paid lesson/audio entitlements.

The content lives in `src/lib/help/faq.ts` and is covered by tests checking its destinations, policy bands, filtering, and UI recovery. Keep it aligned with actual business rules after policy changes. It is operational guidance, **not** a privacy policy, terms of service, medical advice, or a guarantee of customer support response times.

## Dependency

The Help Center's **Open support center** link points to the authenticated `/dashboard/support` route introduced by **PR #71**. Merge/deploy PR #71 and apply its reviewed database migration **before** enabling this Help Center in a deployed release. Do not merge this PR ahead of #71.

## Rollback

Revert the Help Center route/component, the footer link, and the FAQ module. No database changes, checkout changes, new provider configuration or public API contracts are involved.
