# Service photos — administrator workflow

The service catalog already supports the nullable `Service.image` field. The previous administrator editor did not allow editing it, and all seven active services in the 11 November release rehearsal database have no image. This patch adds a **real** create/edit workflow without changing the schema.

## Uploading an approved image

1. A currently active administrator opens `/admin/services`, creates a service or expands an existing service's **Edit** form.
2. Enter a supported HTTPS image URL, or select a licensed JPEG/PNG/WebP file up to 4 MB from **Upload service photo**. The protected `POST /api/admin/services/image` endpoint checks current administrator authorization, size, MIME and header signature; a random Vercel Blob pathname avoids overwriting another asset.
3. The upload control fills the service's image URL on success. **Upload alone does not publish the photo to the service**; select **Save Service** to persist the image alongside the other approved service fields.
4. Clear the URL and save to remove the public image. The public services index displays a branded, decorative gradient card whenever the image is absent or blank; a real approved image always takes precedence. The service detail page has its own fallback change tracked in PR #122. The admin action revalidates service catalog and detail paths.

Only the existing configured Vercel Blob token (`BLOB_READ_WRITE_TOKEN`) is used; it stays on the server. Missing storage returns 503 and the existing edit form remains usable for text/price changes. Approved remote image origins reuse `src/config/images.ts` (the same trusted host policy used for product and article images). No provider, payments, database migrations or customer data are modified.

## Safety and acceptance

- Verify the file and subject rights, service relevance, accessibility description and any client/practitioner consent before publishing. Never use placeholder photography as evidence of real healers or service delivery.
- The Blob upload is public, so do not upload private or sensitive images. Uploaded objects are not automatically deleted when a service image URL is cleared; review unused Blob assets through the approved storage management process.
- Unit tests validate trusted image URLs, null/empty and unsafe URLs. API integration tests validate authentication, storage absence, bytes/signature, size, successful upload and unsafe provider result. UI component tests validate URL selection, upload and preserved value after error.
- After exact seven-job CI is green, review an actual Preview with an authorized administrator and licensed test image, and verify the public detail/gallery plus the absence of exposure to unauthenticated writes. The current Vercel API deployment quota and lack of approved real images block live acceptance.
- Rollback the application code, while retaining any Blob objects for a controlled audit/cleanup; do not delete user-owned images as a speculative rollback.
