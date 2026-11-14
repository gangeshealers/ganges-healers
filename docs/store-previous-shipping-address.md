# Reuse a previous shipping address at checkout

Store buyers can explicitly choose **Use previous shipping address** in the existing `/store/checkout` form. The feature reads from the buyer's own earlier paid orders and fills the editable address fields **only when they click the button**. It never selects an address automatically and never places an address in localStorage/sessionStorage. The regular cart total, Razorpay initiation, payment verification, saved order retry key and checkout ownership assertions are unchanged.

## Data access and validation

The read-only `GET /api/store/shipping-address` endpoint requires an authenticated user. It selects at most ten of that user's newest **paid, shipped, delivered or fulfilled** orders. It also requires an account that is not closed. Unpaid or cancelled checkout drafts and all orders owned by other users are excluded. The server checks the shipping JSON against the same name/street/city/state/postal/phone limits used by staff fulfillment, skipping incomplete or malformed records until a valid prior address is found. It returns only the validated `address` fields, or `{ address: null }`; order/payment identifiers, amounts, tracking numbers, member contact credentials and checkout secrets are never returned. Every response is private/no-store and nosniff, and backend failures have a generic error.

The browser independently validates the returned shape before applying it. The response is ignored if the signed-in account changes while the lookup is running; the account-switch effect clears all address and payment-retry state from the previous buyer. Loading an address shows a review/edit reminder, and buyers can edit every field before placing an order. Missing/invalid/saved-address failures leave the manual form available and do not initiate any payment. Address data is not stored in persistent browser storage by this feature.

## Test coverage

Real-DB API tests create separate buyer accounts and multiple order statuses to verify that a valid prior paid address is selected, recent invalid addresses are skipped, pending checkout drafts and foreign owners are excluded, and closed accounts cannot fetch old addresses. Component tests verify no automatic fetch or fill, explicit opt-in, editability, no browser persistence, manual fallback, and account-switch safety for delayed responses.

No schema migration, new shipping-address book, email, payment charge, provider integration, credential or production data update. Rollback by removing this optional GET route and checkout button/state while leaving all previously saved orders untouched.
