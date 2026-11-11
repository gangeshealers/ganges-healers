# Community pinned-discussion pagination

## Problem
The member-only community endpoint previously loaded *all* pinned posts without a limit on the first latest-sorted page, then loaded a separate non-pinned page. This allowed an unbounded response and could make the feed arbitrarily long before the reader could continue.

## Change
Default Latest discussions now use a single bounded Prisma query ordered by `isPinned DESC, createdAt DESC, id DESC`. Pinned discussions appear first but consume real page slots, with the same cursor continuing through remaining pinned and ordinary posts. The handler still returns `{success,data,nextCursor}`. The existing 1–50 `take` limit is still honored. Soft-deleted content is excluded, and authenticated member access is unchanged.

Existing search results remain chronologically sorted, while Most Liked and Most Commented retain their engagement order. This is a **feed paging** fix, not a moderation/privilege change. It introduces no migrations or provider calls.

## Tests and rollback
`tests/unit/community.pinned-pagination.test.ts` checks authentication gating, single database query, bound and cursor continuity over pinned/non-pinned rows, and unchanged engagement sorts. Rollback is code-only.
