# Healer directory: experience sorting

The public healer discovery page (`/healers`) now includes a **Sort healers** control with **Default order** and **Most experienced**. The selection is a query string (`sort=experience`) and works alongside name/bio/specialization search (`q`) and service selection (`serviceSlug`).

The existing `GET /api/healers` listing endpoint also accepts `sort=experience` without changing the response shape or existing defaults. Both server and API normalize unknown sort values to default order.

## Query and privacy
- The original default remains a stable ascending ID sort.
- Most experienced sorts by saved `experienceYears` descending, breaking ties by ID ascending. All filtering happens **before** server-side cursor pagination.
- The original visibility policy remains enforced in the database: only active, verified practitioners appear publicly.
- Search and sorting controls reset the cursor to page one, while the next-page link keeps all chosen filters and the sort order. A back-to-first-page link lets people start another search.
- No rating claims or live availability claims are derived from the ordering. It is based solely on recorded practitioner experience.

## Verification
The existing API integration test now checks sorted first/second pages and invalid sort fallback. The healer directory component test checks that the query-selected sort is displayed and submitted with the existing service/search filters.

Rollback: revert the directory query/page/API and their tests. No schema or data migration is required.
