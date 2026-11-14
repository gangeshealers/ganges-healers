# Global search publication consistency

`GET /api/search` is a **public discovery endpoint**. The server now reads all seven result categories from the database on each request, enforcing active/published status at query time. Do not add a TTL cache of Service, Healer, Program, Product, Course, Blog or Audio result rows without an invalidation mechanism integrated with every staff publish, archive and deactivation workflow.

## Why

The previous Search API used a local 60-second cache for active Services, Healers, Programs and Products. Unpublishing an item could leave that item in search suggestions until the cache expired, even though its public detail page rejected it. This is misleading and can expose withdrawn public content across deployments.

The endpoint still returns a maximum of ten records per category in its original response structure and uses SQL bind parameters for search input. Search terms are limited to the same 200-character length as the UI. The Healer result set also requires **both** `isActive=true` and `isVerified=true` before displaying practitioners in global search. This does not modify healer creation or approval.

The client-side `no-store` behavior and the route's successful-response `Cache-Control: no-store` remain intact. This patch does not alter search ranking, payment, booking, subscriptions, or storage.

## Validation

`tests/unit/search.publication-freshness.test.ts` simulates an item being withdrawn between searches and checks that a subsequent request re-queries each catalog. It also verifies the verified-healer predicate and bounded query input. Revert the search route and its new test to roll back.
