# Saverlly — Phase 3: Chrome Extension

**Prerequisite reading:** `00-PROJECT-OVERVIEW.md`, `01-PHASE-1-core-platform.md`, `02-PHASE-2-coupon-engine.md` (both complete and passing Definition of Done)

## Goal

Build the Manifest V3 Chrome extension that runs on kiosk computers: detects checkout pages on affiliated merchants, fetches applicable coupons via the API, tests/applies them against the page, tracks affiliate attribution on every affiliated merchant visit (independent of whether that merchant has coupons available), respects the affiliate step-down rule, and reports results back. This phase should be buildable and demoable against 1-2 test merchants even before real affiliate network approvals exist — the client needs a working extension to submit for affiliate/merchant program approvals.

## Design System

Saverlly branding (logo + design system) has been provided, and a Figma file covering the extension's popup UI will follow — build the popup (`popup/popup.html`, `popup/popup.ts`) against that design system once available rather than placeholder styling.

## Tech for This Phase

- Manifest V3
- TypeScript
- `chrome.storage` (device token storage, local cache)
- `chrome.cookies` (step-down detection, tracking cookie verification)
- `chrome.declarativeNetRequest` or `chrome.webNavigation` (checkout URL detection, URL param injection)
- Content scripts (DOM interaction)
- Background service worker (API communication, orchestration)

## Extension Architecture

```
extension/
├── manifest.json
├── background/
│   └── service-worker.ts       # API calls, token management, attribution + step-down orchestration
├── content-scripts/
│   ├── checkout-detector.ts     # runs on affiliated domains, detects checkout state
│   └── coupon-applier.ts        # injects/interacts with coupon field per merchant recipe
├── popup/
│   ├── popup.html
│   └── popup.ts                 # UI shown to the kiosk user; also the manual-trigger entry point
└── lib/
    ├── api-client.ts
    ├── attribution.ts           # sets tracking cookie / injects URL param on every affiliated merchant visit
    └── step-down-check.ts
```

## Device Auth (extension side)

- On first run, the extension needs a device token, handed to it by the desktop agent (Phase 4) via native messaging.
- Every API call includes `Authorization: Bearer <deviceToken>`.
- On any `401`/`403` from the API, the extension must immediately go dormant (no popups, no checkout detection, no attribution tracking) until a valid token is available again.

## Kiosk/Device Status Check

- On extension startup and at minimum every 15 minutes, call `GET /public/devices/me/status` (add this endpoint to Phase 1/2's device API surface if not already present) to confirm the parent kiosk is `ACTIVE` and this specific device is `active: true`.
- If not, or the request fails, the extension must fail safe: disable all checkout detection, attribution, and popups. Do not silently continue operating on stale "last known good" state beyond a short grace window (recommend: max 1 hour grace period on network failure, then force-disable).

## Affiliate Attribution — Runs on Every Affiliated Merchant Visit

**This is independent of coupon availability.** The moment the extension detects the browser is on any active `Merchant.domain` (not just at checkout — attribution should fire as early in the visit as is reliable, per each network's requirements), it must:

1. Look up the merchant's `attributionMethod`, `affiliateTrackingUrl`, `affiliateUrlParamKey`/`affiliateUrlParamValue` via `GET /public/merchants/by-domain/:domain`.
2. If `COOKIE` or `BOTH`: trigger the tracking flow (background fetch/redirect to `affiliateTrackingUrl`) so the platform's affiliate cookie gets set before checkout.
3. If `URL_PARAM` or `BOTH`: ensure the current navigation includes the configured tracking param — if missing, redirect once to the same URL with the param appended.
4. This must happen **regardless of whether the merchant has any coupons at all** — a merchant with zero active coupons still needs attribution tracking to generate commission from organic purchases.
5. Log a lightweight local record of the attribution attempt (used for reconciliation in Phase 5).

## Checkout Detection Logic (for the coupon-apply popup specifically)

1. **Domain match**: on every navigation, check if the current domain matches an active `Merchant.domain` — call `GET /public/merchants/by-domain/:domain`. Cache the result briefly (e.g., 10 min) to avoid excessive API calls on the same domain.
2. **URL pattern match**: check current URL against the merchant's `checkoutRecipe.checkoutUrlPatterns`.
3. **DOM confirmation**: content script checks for presence of `checkoutRecipe.couponFieldSelector` and `cartTotalSelector` on the page before proceeding — this confirms it's actually a live checkout page, not just a matching URL.
4. If all three pass, and the merchant has at least one active coupon, proceed to step-down check. If the merchant has zero active coupons, skip the popup entirely (attribution still already happened per the section above).

## Step-Down Rule Implementation

Before showing the popup:

1. Use `chrome.cookies.getAll({ domain: <merchant domain> })` to inspect existing cookies for known third-party affiliate tracking cookie name patterns (maintained list per network/merchant — store as a config table, populated as networks are integrated).
2. Check the current page URL and referrer for third-party affiliate query parameters (maintained pattern list, separate from the platform's own tracking param).
3. If a competing affiliate signal is detected, **do not auto-show the popup**. Instead, show a minimal, unobtrusive icon/badge state (e.g., extension icon badge) — clicking the extension icon lets the user manually trigger the same apply-best-coupon logic anyway. Log this as `result: "suppressed_stepdown"` via `POST /public/coupon-test-events` regardless of whether the user overrides it.
4. If no competing signal is detected, proceed to show the popup normally.

## Manual Trigger (Clarified Behavior)

The user does not need the automatic popup to use the system. Clicking the extension's toolbar icon at any time on a supported merchant's checkout page runs the exact same coupon-test-and-apply logic as the popup's "Apply" button would — this is the override path for step-down-suppressed cases, and also just a normal always-available option.

## Coupon Apply Flow

1. Popup shows "Apply best coupon?" button (or is triggered manually via the toolbar icon).
2. Background worker fetches all active coupons for the merchant (already retrieved in the domain-match step, or re-fetched if stale).
3. Content script (`coupon-applier.ts`) iterates through coupons **most-likely-to-succeed first** (order by `successCount` descending, `failCount` ascending — simple heuristic, refine later):
   - Enter code into `couponFieldSelector`
   - Click `applyButtonSelector`
   - Wait briefly, then check for `successIndicatorSelector` vs `failureIndicatorSelector`
   - If success: read new total from `cartTotalSelector`, compare to pre-apply total, confirm an actual discount was applied (not just "no error shown") — record `result: "applied"` and stop.
   - If failure: record `result: "failed"`, move to next coupon.
4. Report every attempt via `POST /public/coupon-test-events`.
5. Attribution (see above) should already be in place by this point since it fires on merchant-domain entry, not at checkout — do not gate attribution on the coupon-apply flow.

## Definition of Done

- [ ] Extension loads unpacked, authenticates with a valid device token, and goes dormant with an invalid/missing one
- [ ] Kiosk/device status is checked on a recurring schedule and the extension disables itself when the kiosk is inactive or the device is disabled
- [ ] Affiliate attribution (cookie or URL param) fires on every visit to an active merchant domain, even when that merchant has zero coupons
- [ ] Checkout detection correctly identifies a live checkout page on at least 1-2 test merchants (domain + URL + DOM triple-check)
- [ ] Step-down detection correctly suppresses the auto-popup when a competing affiliate cookie/param is present, and the toolbar icon still lets the user manually apply coupons in that case
- [ ] Coupon apply flow tries codes in order, correctly detects success/failure via the merchant recipe, and stops on first success
- [ ] Every attempt (applied/failed/suppressed/no-coupons) is logged via `POST /public/coupon-test-events`
- [ ] Extension is packaged and ready to submit as part of an affiliate/merchant program approval application
