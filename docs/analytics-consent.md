# Optional marketing analytics consent

The Meta Pixel is **nonessential**. This build does not load its script, create its fallback tracking pixel, or send event-helper calls until the visitor explicitly chooses **Allow optional analytics**.

## Behavior

- With no valid numeric `NEXT_PUBLIC_META_PIXEL_ID`, marketing tracking and the preference UI are not mounted.
- With a configured ID and no stored choice, a nonblocking preference region asks the visitor to **Allow** or **Reject**. Both choices are equally available; rejection does not prevent use of the website.
- Choice is saved locally as `ganges-healers:marketing-consent:v1` with values `allowed` or `denied`. Missing/unreadable storage is treated as **not allowed**. Browsers that block storage do not silently consent.
- Auth and registration paths are never sent to Meta Pixel, even with a stored opt-in.
- The Information section of the footer offers **Privacy preferences** whenever the pixel is configured; visitors can revoke consent. Revocation calls the pixel's consent-revoke operation if it had loaded, and the shared event helper stops sending future events.
- The former `noscript` tracking image was removed; it could not check the stored opt-in choice. A pixel loaded before withdrawal cannot undo previously transmitted events, so the UI makes no such promise.

## Acceptance and business policy

- UI tests cover initial rejection, later opt-in, revocation, previously stored consent, private auth-route suppression and invalid configuration.
- No pixel key, third-party account, domain, policy text, real campaign or deployment setting has been added or modified by this patch.
- The operator and legal reviewer must verify the actual Privacy Policy accurately discloses configured advertising tools, lawful basis, third-party transfers and retention before activating a marketing ID. This technical opt-in gate does not constitute legal approval.
- Test network requests using an expressly authorized Preview account and a test or approved marketing ID; verify no `connect.facebook.net` or `facebook.com/tr` requests before opt-in, and that events stop on revocation. Never enter or publish real campaign credentials for a development smoke test.
- Rollback by reverting the component, event guard, consent helper, footer button and tests. Existing local storage choices should remain undisturbed unless a separately approved privacy migration requires a reset.
