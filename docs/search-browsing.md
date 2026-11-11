# Global Search continuation into full catalogs

The mounted header search and `/search` page continue to use the existing `GET /api/search?q=...` response with **seven result groups**. For stability, this API currently returns at most **ten records per category**, not a global exhaustive count.

The search results page now makes that limit explicit and offers:

- An accessible search field that updates the URL for another query.
- A **Search catalog** link for every non-empty result group, plus persistent browse links to all seven catalogs when no suggestions are returned.
- Links preserving the current search term for Services, Healers, Programs, Courses, Store products and Audio. The Blog does not support server-side `q` filtering, so it opens `/blog` **without** implying that a filtering contract exists.
- Bounded URL generation (200 characters for global search, 120 for per-catalog search) with standard URL encoding. Links use internal paths only.

No search schema, public API, search caching strategy, authorization, publication filtering, or database migration changes. The existing group-specific search payload and navigation suggestions remain intact. The site does not invent total matching counts or claim the first ten results are all available records.

Rollback: revert `src/app/search/SearchPageClient.tsx` and its destination helper.
