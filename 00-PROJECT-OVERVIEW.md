# Saverlly — Project Overview

**Read this file first, before touching any phase file.** This document explains the full system so every phase is built consistent with the whole. Each phase file (`01-...` through `05-...`) is a self-contained build spec for that slice of work, but all of them assume the shared architecture, data model conventions, and terminology defined here.

> **Revision note:** this overview was revised after client feedback on the initial spec. Key changes from v1: kiosks use a simple active/inactive **status**, not an approval workflow; individual computers no longer require approval; commission attribution is explicitly decoupled from coupon sourcing; payout eligibility now requires *confirmed* commission status; Stripe added as the payment gateway; frontend stack finalized.

---

## 1. What This System Is

This is a multi-tenant SaaS platform for **internet kiosk businesses** (private shops where people pay to use a computer for a set amount of time). The platform adds a secondary revenue stream: a **Honey-style Chrome extension** that automatically finds and applies coupon codes when a kiosk user shops online, generating affiliate commission revenue that gets split between the platform owner and the kiosk business.

The kiosks' existing time/billing system (how they charge customers for computer time) is **completely separate and out of scope** — this system does not integrate with it in any way.

## 2. The Four Components

1. **Backend / API** — one unified backend, multi-tenant, servicing:
   - The **Admin Console** (platform owner — manages kiosks, coupons/merchants/affiliate integrations, revenue-share terms, payouts)
   - The **Kiosk Portal** (kiosk owners — manage their own locations/computers, announcements/ads, view earnings and payouts)
   - The **Chrome Extension** (via device-token API access)
   - The **Desktop Agent / exe** (via device-token API access)

2. **Chrome Extension** (Manifest V3) — runs on every kiosk computer's browser. Detects checkout pages on affiliated merchant sites, fetches valid coupons, tests/applies them, tracks affiliate attribution, respects affiliate step-down rules, reports results back to the API.

3. **Desktop Agent** (Windows exe/service) — runs on every kiosk computer. Registers the device against a kiosk location, force-installs and re-asserts the Chrome extension via Chrome enterprise policy (including after any machine/profile reset), displays kiosk announcements/ads, syncs settings.

4. **Database** — PostgreSQL, single database, tenant-scoped by `kiosk_id`.

## 3. Frontend Stack

Both the Admin Console and Kiosk Portal are built as one Next.js application (route-grouped by role) or two apps sharing a component library — decide during Phase 1 setup based on how different the two experiences end up being. Confirmed stack:

| Layer | Choice |
|---|---|
| Framework | **Next.js 16+** (App Router) |
| UI components | **shadcn/ui** |
| Styling | **Tailwind CSS** |
| Client state | **Zustand** |
| Server state / API calls | **TanStack Query** |

## 4. Core Business Rules (non-negotiable — every phase must respect these)

- **Kiosk status, not approval**: There is no review/approval workflow for kiosks. Admin can add, edit, or remove a kiosk directly. A kiosk simply has a `status` of `ACTIVE` or `INACTIVE`. The system only functions for `ACTIVE` kiosks. Admin can flip this at any time.
- **No approval step for computers**: Once a kiosk is `ACTIVE`, the kiosk owner can freely add, edit, or remove locations and computers with no review step. A new computer registers itself using a **location setup code** (see Phase 4) purely to identify which kiosk/location it belongs to — not as a gate to unlock functionality.
- **Individual kill switch still exists**: Even though computers don't need approval to start working, admin (and the kiosk owner, for their own devices) must still be able to instantly disable a single computer at any time (e.g., a stolen or compromised machine). This is a `disabled`/`active` toggle on the Device record, separate from any approval concept.
- **Multi-tenancy**: One backend, one database. Every kiosk-owned resource (locations, computers, announcements, commission records) is scoped by `kiosk_id`. Role-based access control enforces that kiosk-owner users can only ever see/modify their own tenant's data. Only admin sees across tenants. Admin also has visibility into and management of each kiosk's own user accounts/roles.
- **Per-kiosk revenue share**: The commission split percentage is a field on the Kiosk entity, set individually per kiosk by admin — never a global constant.
- **Coupon sourcing is independent of affiliate tracking**: A store can be added with or without a coupon API. Coupon *codes* come from one or more of: affiliate API, scraping, manual entry. Affiliate *tracking/attribution* (the cookie or URL-parameter tagging that credits a sale to the platform) must happen on every affiliated store visit regardless of which coupon-sourcing method is used — these are two separate systems that both key off the `Merchant` record, and a store with no coupon API can still be a fully tracked, commission-generating affiliate relationship.
- **Commission pending window**: Affiliate networks typically take 30-90 days (varies by store) to confirm a sale isn't going to be returned/cancelled. Pending commission must be visible to both admin and the relevant kiosk, but **only confirmed commission counts toward a kiosk's payable/withdrawable balance**. Pending is informational only.
- **Step-down rule**: The extension must detect whether a different affiliate's tracking cookie/URL parameter is already present on a merchant site before showing its popup. If detected, the popup must NOT auto-show — but the user can still manually trigger the extension (via its toolbar icon) to run and apply the best coupon anyway.
- **No cashback/rewards** — this system only applies coupon codes. No point systems, no cashback, no gift cards.
- **Independence from kiosk billing software** — never assume or build any hook into whatever time/billing software a kiosk already runs.
- **Extension must survive Chrome resets** — kiosk computers reset Chrome to a clean profile (cookies, logins, extensions wiped) on every user logout. The extension install must not depend on profile state — see Phase 4 for the enforcement mechanism, and the open question about which reset method the client uses.

## 5. Two Classes of Authentication

- **Human users** (admin, kiosk-owner, location-manager roles) — JWT-based session auth (access + refresh tokens), scoped by role and `kiosk_id`.
- **Machine clients** (Chrome extension, desktop agent) — long-lived **device API tokens**, issued once a device registers itself against a location. Machine clients hit a narrow, specific set of endpoints — never the admin/portal endpoints.

## 6. Backend Tech Stack

| Layer | Choice |
|---|---|
| Backend framework | NestJS (Node.js + TypeScript) |
| Database | PostgreSQL |
| ORM | Prisma |
| Auth | JWT (users) + API tokens (devices), NestJS Guards for role/tenant scoping |
| Background jobs | BullMQ + Redis |
| Scraping | Playwright |
| Payment gateway | **Stripe** (Stripe Connect for kiosk payouts) |
| Chrome extension | Manifest V3, TypeScript |
| Desktop agent | Node.js, packaged with `pkg` (Windows target) |
| API style | REST, JSON |

## 7. High-Level Data Model (expanded per-phase in each build doc)

- `Kiosk` (tenant, has `status`) → `Location` (1-to-many, has `tags`) → `Device` (1-to-many, has `active`/`disabled`)
- `User` — has a `role` (`admin`, `kiosk_owner`, `location_manager`) and optionally a `kioskId` if not admin
- `Merchant` — an affiliated store; may or may not have an `AffiliateProgram`/API connection, but always has an affiliate tracking method (cookie or URL param based)
- `Coupon` — belongs to a `Merchant`, has a `source` (`api`, `scrape`, `manual`)
- `CouponTestEvent` — a log of a coupon being tried at checkout on a `Device`
- `CommissionEvent` — a conversion attributed to a `Device` → `Location` → `Kiosk`, with a `pending`/`confirmed`/`reversed` status
- `Announcement` — belongs to a `Kiosk`, scoped to specific `Location`(s) or all, with an active time window and repeat-display rules
- `DeviceToken` — machine auth credential tied to a `Device`
- `LocationSetupCode` — a reusable code per location, used to identify a new computer during agent setup

## 8. Repo Structure, Testing, and API Docs

Full detail lives in `08-ENGINEERING-CONVENTIONS.md` — read it alongside this file before starting Phase 1. Summary:

- **One monorepo, three separate deployables**: `apps/backend`, `apps/dashboard`, `apps/extension`. None of them run in the same process or share a deploy pipeline, but they share a single repo (and can share TypeScript types where useful, e.g. API DTOs).
- **Testing**: unit tests for everything, plus mandatory integration tests for money-handling logic (commission calculation, revenue-share splits, payout aggregation, Stripe transfer flows) and RBAC/tenant-isolation logic (cross-kiosk data access must be integration-tested, not just unit-tested, since the real failure mode is a DB/auth-layer leak a unit test can't see).
- **API documentation**: auto-generated from an OpenAPI/Swagger spec via NestJS's built-in Swagger support (`@nestjs/swagger`), not hand-written. Exported to markdown for the client to publish to their documentation platform of choice.

## 9. Design System & Branding

- Product name: **Saverlly**
- A design system and logo files have been provided by the client (Saverlly_Logo.ai)
- A Figma file/link covers the **Chrome extension UI only** — build the extension's popup (Phase 3) against it once available.
- **Dashboards (admin console + kiosk portal) are designed and built in-house** — no client-provided Figma for these. Bootstrap using **shadcn/ui dashboard templates** as the starting structure/layout, then apply the Saverlly logo/branding on top. See `07-FRONTEND.md` for specifics.

## 10. Build Order

Build and verify each phase in order — later phases depend on earlier ones:

1. `01-PHASE-1-core-platform.md` — backend foundation, auth, roles, tenancy, admin console + kiosk portal APIs
2. `02-PHASE-2-coupon-engine.md` — coupons, merchants, scraping, affiliate integrations (API and non-API), background jobs
3. `03-PHASE-3-chrome-extension.md` — the extension itself
4. `04-PHASE-4-desktop-agent.md` — the exe agent
5. `05-PHASE-5-commission-tracking.md` — commission attribution, confirmed-vs-pending payouts, Stripe integration
6. `07-FRONTEND.md` — dashboard build spec (Next.js/shadcn), applies across Phases 1-5's API surface
7. `08-ENGINEERING-CONVENTIONS.md` — monorepo structure, testing strategy, API documentation setup — read alongside Phase 1, applies for the life of the project

Each phase file includes its own data model additions, API endpoints, business logic detail, and a Definition of Done. Do not begin a phase until the previous phase's Definition of Done is met.

## 11. Final Notes


- Location setup codes should not expire. They stay valid/reusable indefinitely per kiosk.
- Individual computers can still be disabled/killed at any time even though they don't require approval to start.
