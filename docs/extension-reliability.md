# Extension reliability update — 1.0.8

## Current behavior

The desktop agent hands over the token and backend URL before the first status check.
Disconnected installations retry every minute and on popup open. Activation rescans open
tabs. Deactivation clears badges and popup state and cancels further coupon DOM actions.

Checkout detection follows full navigation, History API routes, hash routes, and loaded
child frames. Query-only URL cleanup preserves the current run. Detection waits for delayed
checkout DOM without a ten-second cutoff; reinjection replaces the existing observer.
Opening the popup retries a missed detection. Merchant lookups fall back from subdomains
to explicitly registered parent domains. Application targets the confirmed frame/document.

Selectors copied with JSON-escaped attribute quotes are normalized both at the API input
and in the extension. Missing optional indicator selectors cannot throw. Visible controls
are preferred over hidden responsive duplicates. Click-to-reveal controls are used only
after Apply, and their asynchronously rendered input/button are awaited.

Configured replace/remove recipes compare codes and reapply the winner. Legacy recipes
without verified comparison behavior try failures and stop at the first confirmed saving;
the popup does not claim that every code was compared. Existing shopper coupons are preserved
when their removal/restoration is not known. Slow requests are allowed fifteen seconds,
with bounded additional time while the merchant indicates processing. Checkout navigation
and device deactivation stop further application actions.

Cart totals exclude aria-hidden animation duplicates. A successful code is verified against
the settled total. Reapplication reports the actual final discount instead of rejecting a
working code solely because its total differs from an earlier trial. A later unconfirmed
trial does not automatically discard an earlier confirmed winner. Results and progress carry
run IDs and are serialized per tab so stale updates cannot overwrite a completed run.

Expired coupons are filtered server-side. Apply fetches fresh merchant/coupon data. Successful
trials are reported as `valid`, without savings; the final `applied` event carries the saving.
Events are persisted locally with stable UUIDs, retried after outages, and bound to the
original device token. The API creates the event and updates counters in one transaction;
duplicate UUID submissions do not double-count. The popup refreshes lifetime savings after
the server accepts a queued final event.

## Attribution decision

Keep attribution tied to an explicit Apply action. Do not restore automatic tagging on
every merchant visit. The original phase documents predate the current implementation;
their automatic-visit requirement is superseded by this decision.

Chrome requires related user action before affiliate codes, links, or cookies are included:
https://developer.chrome.com/docs/webstore/program-policies/affiliate-ads

Automatic navigation never attributes. An authorized URL redirect stores a short-lived
continuation before navigation, and checkout detection resumes that comparison once.
Retries in the same tab reuse a recent attribution attempt for thirty minutes rather than
minting fresh sub-IDs and reloading again after a merchant strips query parameters.
Same-network competitor parameters are distinguished by value, and only observed cookie
values created by Saverlly's tracking request are excluded from cookie step-down checks.
Tracking requests remain best-effort; a successful fetch is not proof of commission credit.

## Production observations and change

On September 17, 2026, Target's production coupon-input, Apply-button, and cart-total
selectors contained literal backslashes before attribute quotes. All three were corrected
through the admin dashboard and verified after reload. The reveal selector was
`#add-promo-code-btn`, patterns were `/cart, /checkout`, success selector was empty, and
comparison behavior was unset. No unverified comparison mode was enabled.

Allbirds' configured success indicator is `button[data-event-name="remove_discount_code"]`.
Its total selector matches a cell containing an aria-hidden animated price and the accessible
current price. A live test cart confirmed this DOM structure. The tested `freetry75` code was
rejected by the store; successful-winner regressions use deterministic fixtures, not a claim
that this code works in production. Direct Target browsing was blocked in the available
browser, so its current live DOM could not be independently inspected.

Both merchants currently have placeholder tracking URLs in production (`example.com/track`
and `target.com/testing`). They need genuine affiliate tracking configuration before network
commission attribution can be verified; extension fixes cannot create that relationship.

## Release order and checks

1. Deploy the backend first. No schema migration is required: existing event UUIDs provide
   idempotency and event results are already stored as strings. Old extension clients remain
   supported; omitted `isFinal` retains the original success-count behavior.
2. Publish/install extension 1.0.8 after the backend accepts `valid`, `eventId`, and `isFinal`.
3. Verify a real eligible coupon on each merchant using the deployed package. Confirm the
   final code, settled cart total, popup result, and one final savings event agree.

Regression commands:

```text
npm run build --workspace=@saverlly/shared-types
npm test --workspace=@saverlly/extension -- --runInBand
npm run test:integration --workspace=@saverlly/backend -- --runInBand public-api.e2e-spec.ts
npm run build --workspace=@saverlly/extension
npm run test:browser --workspace=@saverlly/extension
```

Browser verification is isolated from the desktop native host and production API. It covers
comparison, reapplication, popup reopen, reporting outage/recovery, URL attribution resume,
and a Target-style reveal checkout. It never places an order.
