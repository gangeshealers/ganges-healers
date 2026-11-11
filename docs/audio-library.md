# Public Audio Library discovery

The public `/audio` page lists **published** tracks only. It supports text search across title, description and category; a category selector; newest/shortest/longest sorting; and **All / Free / Premium** access filters.

- `access=free` selects tracks with `isPremium=false`; `access=premium` selects `isPremium=true`. Missing, repeated and unknown access values fall back to All.
- Filters are applied at the database level before counting and paging. Search terms and access choice are retained across sort links and previous/next-page links. Changing a filter returns to page one.
- The page loads at most 12 tracks, with stable ID tie-breakers. Out-of-range and malformed page values are bounded and do not create oversized queries.
- The Free/Premium badges describe library access requirements, **not** unlock entitlements. Track streaming and premium access retain the existing authenticated player and API checks.
- No audio files, metadata, customer access rights, or payments are created by these controls. Actual published audio requires admin authoring and approved media URLs.

There is no new public API or schema migration. Rollback: revert `src/app/audio/page.tsx` and `src/lib/audio/catalog-queries.ts`.
