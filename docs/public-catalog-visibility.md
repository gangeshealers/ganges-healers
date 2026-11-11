# Public catalog visibility and practitioner verification

The public catalog must not expose content that staff have withdrawn or practitioners who have not passed the current verification process. This is a **read-time policy**, independent of the existence of retained paid booking/order records.

- `/services/[slug]` now reads only `Service.isActive=true` on the detail page and in its SEO metadata. An archived service may remain in existing bookings, but its public landing page must not remain a new acquisition route.
- The public Healers directory, `GET /api/healers`, profile page `/healers/[slug]` and `GET /api/healers/[slug]` require both `Healer.isActive=true` and `Healer.isVerified=true`. Previously the homepage featured list already required verification while the directory and detail URLs did not.
- Public service detail pages show active, verified healers for a service. `GET /api/services/[id]` applies the same gate when summarizing practitioners linked to previous bookings.
- Staff administration, existing paid appointments, payment/refund records and program fulfillment remain unchanged. Archived or unverified practitioners are still managed through the existing secure admin tools, not the public storefront.

The read filters are enforced in database queries, not merely hidden with CSS. Integration/browser tests create unverified fixtures and assert they are excluded while verified results paginate normally. No migration, price, booking, membership or review data change. Revert the read-side patches to roll back.
