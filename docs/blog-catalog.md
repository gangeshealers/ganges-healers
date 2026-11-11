# Public wellness articles catalog

The public `/blog` page now provides text search and bounded pagination for **published** articles.

- `q` searches article title and excerpt case-insensitively. It is trimmed and capped at 120 characters; arrays or malformed inputs are ignored.
- `page` is a positive integer from 1 to 1000, with 9 articles per page. Out-of-range pages are clamped to the last real page.
- The article count and listing share an explicit `published=true` filter. Drafts and unpublished articles never appear in page counts or cards.
- Results are stable within a given database snapshot, ordered by publication record creation date and ID descending. The list does not try to read large article body content for every card.
- Previous/next links retain the search term and do not create additional writes. An empty search has a Clear action.

The existing `getPublishedBlogSummaries(take?)` API remains untouched for homepage/article previews. The new `getPublishedBlogPage()` is used only by the Blog catalog page. It does not modify article creation, editing, publishing, role permissions, editorial approval, sitemap contracts, or external media.

No migration or provider changes are required. Rollback: revert the Blog page and new paginated query helper; existing article records remain unchanged.
