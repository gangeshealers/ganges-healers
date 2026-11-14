# Member course learning library

The signed-in `/courses/enrolled` page is a private, server-rendered learning workspace. It replaces the legacy browser-side unbounded enrollment fetch with a database query that always uses the current authenticated account ID and status `active` / `completed`. A search term (max 100 characters), status tabs and bounded 12-row pages retain filters in links; malformed or repeated query parameters reset to safe defaults. Requested pages are clamped to the last existing page, up to page 1000.

The list includes archived courses when the member's enrollment is active or completed. It does **not** publish archived courses into the public catalog or grant access to users who are not enrolled. Existing lesson API checks continue to enforce enrollment ownership. The course card computes completed lesson count from actual ordered lessons (stored progress exceeds completed lesson order), not from dividing the raw progress integer by lesson count. For active courses it links to the first unfinished lesson; for fully completed courses it offers a first-lesson review; for courses with no lessons it links to the owned course overview. An old prematurely completed status does not falsely claim the entire curriculum is finished.

The personal account menu includes **My courses**, and the dashboard always offers a View All link even before the first enrollment. The page does not send provider requests or mutate course progress, enrollments or purchases. Only owned enrollment metadata is read; private search pages are marked noindex. Existing `GET /api/courses/enrollments/me` remains unchanged for other client workflows.

Verification includes signed-out redirect, account ownership, nonconsecutive lesson numbering, legacy premature completion, archived enrollment access, bounded pagination and search, and a real browser free-enrollment journey through the archived-course continuation path.

No migration, new provider, environment variable, or payment changes. Rollback by reverting the page/navigation/tests/docs; enrollments and completed lesson progress remain intact.

## Previewing a course before publication

In **Admin → Courses**, open **Manage lessons and details**, then **Preview saved course**. Review the cover, price and description, choose a lesson from the curriculum, and step through the lesson text and media. The preview uses the last saved course. Returning to the editor preserves unsaved fields. Staff can review drafts, archived courses and published courses through the same editor.

The preview uses the course already loaded by the admin editor. Opening it and navigating lessons do not enroll the reviewer, change progress, or publish the course. Learners see the saved material after the usual publish and enrollment steps.
