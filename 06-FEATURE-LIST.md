# Saverlly — Full Feature List (Internal/Technical)

> Revised after client feedback: no kiosk approval workflow (status-based instead), no per-device approval (kill-switch only), location setup codes, location tags, Stripe payouts, admin-side kiosk user management, announcement repeat policy + visual editor, explicit affiliate-tracking-independent-of-coupon-API, pending vs. confirmed commission enforcement, Next.js/shadcn/Tailwind/Zustand/TanStack Query frontend.

## 1. Admin Console

- Create, view, edit, and remove kiosk accounts directly (no approval workflow)
- Toggle kiosk status (`ACTIVE`/`INACTIVE`) — system only functions for active kiosks
- Set/edit per-kiosk revenue-share percentage
- Manage kiosk user accounts and roles directly (not limited to kiosk-owner self-management)
- Manage merchant records, with a unified flow to configure affiliate tracking (required) and coupon sourcing (optional, combinable: API / scrape / manual)
- Manage each merchant's checkout "recipe" (coupon field selector, apply button, success/failure indicators, etc.)
- Manually add/edit/remove coupon codes
- Configure and manage scrape sources (URL + selector rules), trigger manual runs
- Configure and manage affiliate network/program connections, including an explicit "has coupon API" flag
- View coupon performance (success/fail counts) per coupon and per merchant
- View all commission events across all kiosks, with pending vs. confirmed clearly separated
- Review and process kiosk payouts via Stripe
- View all kiosk locations, including tags, for future geo-targeted advertising
- Individually disable/enable any device at any time (kill-switch, independent of approval)
- Full activity oversight across the whole platform

## 2. Kiosk Portal (Kiosk Owners)

- Log in to a tenant-scoped dashboard
- Add/edit/remove their own location(s) freely, no review step
- Tag locations for ad targeting purposes
- Generate reusable device setup codes per location
- Add/edit/remove devices at their location(s) freely, no review step
- Individually disable/enable their own devices at any time (kill-switch)
- Create/edit/delete announcements using a visual editor (text, image, layout)
- Set announcement repeat policy (once, every login, or up to N times)
- Scope announcements to specific location(s) or all of them
- View their own commission events, pending vs. confirmed clearly separated
- View their available (confirmed) balance vs. pending balance
- Connect a Stripe account for payouts
- View payout history
- Manage sub-accounts (location-manager role), if enabled

## 3. Location-Manager Role (optional sub-role)

- Same as kiosk-owner, scoped further to assigned location(s) only

## 4. Chrome Extension (End-User Facing)

- Detects when a browser is on an affiliated merchant's domain
- Triggers affiliate tracking (cookie and/or URL parameter) on every affiliated merchant visit, independent of whether that merchant has any coupons
- Detects when the current page is a live checkout page (URL + DOM confirmation)
- Fetches applicable coupons for the current merchant, if any
- Displays a popup prompting the user to apply a coupon
- Tests coupon codes against the live checkout form, most-likely-to-succeed first
- Detects success/failure of each coupon attempt via merchant-specific indicators
- Automatically applies the best/first-successful coupon
- Displays confirmation of savings applied
- Detects existing competing affiliate cookies/URL parameters (step-down rule) and suppresses the automatic popup when detected
- Always allows manual trigger via the extension's toolbar icon, even when the popup is suppressed
- Authenticates via device token (received from the desktop agent)
- Periodically re-checks kiosk/device status
- Goes fully dormant if the kiosk is inactive, the device is disabled, or the token is invalid/missing
- Reports every coupon attempt (applied/failed/suppressed/no coupons available) back to the backend
- Install persists through the kiosk's Chrome/profile reset process without manual reinstallation

## 5. Fleet Management Software (Desktop Agent)

- One-time registration per computer using a reusable location setup code (identification only, no approval wait)
- Force-installs the Chrome extension via Chrome enterprise policy
- Re-asserts the install policy on every startup (self-healing against machine/profile resets)
- Chrome handles extension updates automatically via the configured update URL
- Locks the extension so kiosk users can't disable/remove it
- Hands the device token to the extension via native messaging, re-asserted every startup
- Polls for and displays announcements/ads directly on the main computer screen (not in-browser)
- Respects each announcement's repeat policy
- Continuously checks kiosk/device status and stops serving the device token the moment either is turned off

## 6. Coupon Engine

- Manual coupon entry per merchant
- Automated coupon scraping from configured external sites
- Automated coupon ingestion from affiliate network APIs, for merchants whose program supports it
- Stores without a coupon API still fully supported — coupon codes sourced manually/via scraping, tracking unaffected
- Deduplication of coupons across sources
- Coupon expiry handling
- Coupon success/failure tracking, used to prioritize which codes are tried first

## 7. Affiliate & Commission System

- Per-merchant affiliate tracking configuration (cookie-based, URL-param-based, or both) — required for every merchant regardless of coupon-sourcing setup
- Attribution tracked on every affiliated merchant visit, not just at checkout
- Sub-ID/click-ID based attribution linking a sale back to a specific device
- Commission event ingestion (via webhook and/or scheduled polling, per network)
- Pending → confirmed → reversed commission status lifecycle, reflecting each network's own return/cancellation window (typically 30-90 days)
- Pending commission is visible but never included in a payable balance
- Automatic calculation of kiosk revenue share, finalized only once a commission is confirmed
- Scheduled aggregation of confirmed-only commissions into per-kiosk payout records
- Stripe Connect onboarding for kiosk owners
- Stripe-executed payouts, with status tracked via Stripe webhooks
- Kiosk-owner visibility into their own commission and payout data only

## 8. Multi-Tenancy & Access Control

- Single backend, single database, tenant-scoped by kiosk
- Role-based access control: admin, kiosk-owner, location-manager, device
- JWT-based session auth for human users (access + refresh tokens)
- Device-token auth for machine clients (extension, agent), separate from human auth
- Default-deny endpoint access — every route requires an explicit role/permission check
- Cross-tenant data isolation (kiosk-owners can never see another kiosk's data)

## 9. Status & Kill-Switch System

- Kiosk-level status toggle (active/inactive) — no approval workflow
- Device-level kill-switch (active/disabled) — independent of any approval requirement
- Recurring status checks (not just at startup) from both extension and agent
- Fail-safe behavior on network failure or deactivation (system disables itself rather than defaulting to "on")

## 10. Location & Geo Data

- Location records with address, latitude/longitude, and tags
- Tags used for more precise future ad targeting
- Location-level device counts and metadata

## 11. Reporting & Visibility

- Coupon performance reporting (success/fail rates per code and per merchant)
- Commission reporting (per kiosk, per location, per merchant, by date range), pending vs. confirmed
- Payout history and pending/available balances
- Device fleet status (active/disabled, last-seen timestamps)

## 12. Dashboards (Frontend)

- Built with Next.js 16+, shadcn/ui (dashboard/sidebar template), Tailwind CSS
- Zustand for client-side state, TanStack Query for server data
- Role-gated route groups for Admin Console vs. Kiosk Portal

## 13. Explicitly Out of Scope (for clarity)

- No integration with kiosks' existing time/billing software
- No cashback, points, or gift card rewards — coupon codes only
- No support for non-Windows kiosk computers (Mac/Linux) unless requirements change
