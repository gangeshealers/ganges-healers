# Catalog Editor Hydration and Reviewed-Form Checks

The shared `CatalogEditor` preserves server-action form submission before JavaScript hydrates, while its inline success/error messages are driven by the client component after hydration.

A browser test that deliberately tampers with a hidden program-availability field must therefore wait until the **client action handler** is ready. Otherwise the browser can send the native pre-hydration server action, receive a rejected result, and still not display the client-only inline error. This made the security-review test timing-sensitive, especially under a busy CI browser server.

The shared editor now exposes a non-sensitive `data-hydrated="true|false"` attribute. The program catalog E2E test waits for `true` before issuing its deliberately malformed request. A component test verifies the signal after React effects run.

No API/status/validation rules, server action signatures, catalog edits, payment behavior, or authorization change. The native form remains available before hydration. This patch ensures that tests exercise the intended inline-feedback path without racing Next.js hydration.

Rollback: revert the attribute, local React effect and test additions; no migration required.

On the healer administration page, profile edits, verification and availability share a reviewed version. After staff save one form, the other controls for that healer wait until the refreshed profile arrives. A failed save releases the controls and leaves the draft available for review. If the page cannot refresh after a successful save, staff can select **Reload updated profile**. Other healer profiles remain usable during the save.
