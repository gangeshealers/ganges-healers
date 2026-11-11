# Storefront Price Sorting

Public `/store` now lets shoppers choose **Default order**, **Price: low to high**, or **Price: high to low**. This is a read-only catalog enhancement; it does not change checkout totals, payment, stock, or product publication.

## Behavior
- Sorting happens in PostgreSQL **before** taking the page. Price sorts use `pricePaise` in the selected direction plus ascending product ID for deterministic ties.
- Existing catalog search, product category and chakra filters remain active while changing sort, category or chakra.
- The `cursor` link for Next products and Back to first page preserves the current sort and other filters. Choosing a different sort through the search form resets the cursor to page one.
- `GET /api/store/products` accepts optional `sort=price_asc` or `sort=price_desc`. Invalid/duplicate values fall back to the previous default ID order, and the response shape is unchanged.
- Inactive products remain excluded. Neither price display nor stock labels are modified.

## Validation
- `tests/unit/store.price-sort.test.ts`: accepted sorts, fallback, stable Prisma order and active-product filtering.
- `tests/components/StorePage.smoke.test.tsx`: selected sort and filter-preserving navigation.
- `tests/integration/store.products.list.api.test.ts`: sorted cursor page continuation.

Rollback: revert page/query/API/test and this document. No schema changes, data migration or new dependency.
