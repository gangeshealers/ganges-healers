# Public information and legal policy publishing

## Public routes

- `/about` explains the platform using existing product features, without inventing founders, addresses, certifications or medical claims.
- `/contact` links to the public Help Center and the authenticated `/dashboard/support` inbox. No unverified business email, telephone number or emergency response hours are advertised.
- `/privacy` and `/terms` render only explicitly published administrator article text, or a clearly identified **not yet published** notice. Unpublished policy pages emit `noindex, nofollow` metadata. These fallback notices **are not legal agreements** and do not satisfy commercial launch approval.
- The site footer links all four pages. All pages are server-rendered and the legal content is read freshly from PostgreSQL.

## Admin publishing workflow

1. Obtain the actual business entity/contact details, legally reviewed Privacy Policy and Terms of Service, effective dates, refund/cancellation references, jurisdiction and all required disclosures. Do not generate or publish inferred commitments.
2. From `/admin/blog/new`, create a draft article with the exact reserved slug `privacy-policy` or `terms-of-service`. Article creation is administrator-only, audited and always starts unpublished.
3. Paste the approved plain-text copy, save, inspect the preview, then separately **Publish** using the existing version-checked administrator editor. The same approved content appears on the corresponding `/privacy` or `/terms` route.
4. Review both pages and their dates on the exact deployment; check `/admin/launch` for publication presence. The launch dashboard explicitly says publication **does not verify legal approval**.
5. To withdraw/revise terms, use the existing controlled Unpublish/Edit/Publish actions. Historical customer acceptance and legal retention requirements need separate owner/legal review; unpublishing does not erase audit history.

The BlogPost publication model is reused without new schema, credentials or write endpoints. Existing article editor role authorization, change versions, audit trail and HTML-escaped plain-text rendering remain in place. This shared editor is a delivery workflow, **not a replacement for legal sign-off**.

## Acceptance and rollback

- Exact-head unit tests: legal slug and publication filter; missing/empty policy behavior; rendered text and noindex metadata.
- Component tests: public navigation, About, Contact and footer links.
- Browser test: mobile routes and help navigation.
- Check the actual published policies under the intended canonical domain, including legal review, accessibility, footer links and response status.
- Rollback code by reverting the public pages and footer. Reverting code does not delete any approved content or audit records. Never silently delete historical legal acceptance records; future proof-of-consent storage must be independently specified and approved.
