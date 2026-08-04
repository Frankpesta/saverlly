# Saverlly — Frontend Dashboards

**Prerequisite reading:** `00-PROJECT-OVERVIEW.md` and whichever backend phase(s) a given screen depends on. This file can be built incrementally alongside Phases 1-5, screen by screen, as their backing API endpoints become available — it does not need to wait for all five backend phases to finish before starting.

## Goal

Build the Admin Console and Kiosk Portal as a Next.js application, covering every screen implied by Phases 1-5's API surface.

## Design System

No client-provided Figma for the dashboards — these are designed and built in-house. **Bootstrap using shadcn/ui dashboard templates/blocks** (e.g. the official shadcn dashboard examples) as the starting layout/structure, then apply Saverlly branding (logo + color palette from the provided design system files) on top. This gives a faster, cleaner starting point than building every screen from scratch while still landing on-brand.

## Tech Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16+ (App Router) |
| UI components | shadcn/ui |
| Styling | Tailwind CSS |
| Client state | Zustand |
| Server state / data fetching | TanStack Query |

## Structural Recommendation

Single Next.js app, route-grouped by role:
```
app/
├── (admin)/
│   ├── kiosks/
│   ├── merchants/
│   ├── coupons/
│   ├── scrape-sources/
│   ├── affiliate-programs/
│   ├── commissions/
│   ├── payouts/
│   └── users/
├── (kiosk-portal)/
│   ├── locations/
│   ├── devices/
│   ├── announcements/
│   ├── earnings/
│   └── settings/
└── (auth)/
    ├── login/
```
Shared component library (shadcn primitives + app-specific composed components) lives outside both groups. Route-group-level middleware enforces role access, backed by the same JWT/role claims from Phase 1 — never trust client-side role checks alone, every API call is independently guarded server-side regardless of what the frontend renders.

## Screen List by Phase Dependency

**Auth (Phase 1)**
- Login
- Session/token refresh handling (silent, via TanStack Query + Zustand auth store)

**Admin — Kiosks & Users (Phase 1)**
- Kiosk list (status, revenue-share %, quick status toggle)
- Kiosk detail/edit (including Stripe connection status once Phase 5 is live)
- Kiosk user management (add/edit users per kiosk, role assignment)

**Admin — Locations & Devices (Phase 1)**
- Cross-kiosk location list/map view (leveraging lat/long + tags — sets up for future ad targeting UI)
- Device list with kill-switch toggle

**Kiosk Portal — Locations & Devices (Phase 1)**
- Location CRUD, tag management
- Setup code generation/display per location (simple copyable code, with revoke/regenerate)
- Device list scoped to their own kiosk, with individual disable toggle

**Admin — Merchants & Coupons (Phase 2)**
- Merchant list/CRUD, with the unified "add store" flow (tracking method required, coupon sourcing optional/combinable)
- Checkout recipe editor (structured form, not raw JSON)
- Coupon list/CRUD per merchant, success/fail rate display
- Scrape source management, manual "run now" trigger
- Affiliate program management

**Chrome Extension Submission Support (Phase 3)**
- No dedicated dashboard screen — but consider a simple internal QA page listing test merchants and their recipe status, useful while iterating on Phase 3

**Kiosk Portal — Announcements (Phase 4)**
- Announcement list/CRUD
- Visual editor for announcement/ad content (text + image, layout — treat as its own composable component, likely the most involved single UI piece in the portal)
- Repeat-policy configuration (once / every login / max N times)
- Location targeting (specific locations vs. all)

**Admin & Kiosk Portal — Commissions & Payouts (Phase 5)**
- Admin: cross-kiosk commission event table, filterable, pending vs. confirmed clearly distinguished
- Admin: payout review/approval + Stripe transfer trigger
- Kiosk portal: their own commission history (pending vs. confirmed split, matching the `GET /my/balance` shape from Phase 5)
- Kiosk portal: Stripe Connect onboarding flow (redirect to Stripe-hosted onboarding, return/refresh handling)
- Kiosk portal: payout history

## State Management Conventions

- **TanStack Query** owns all server data — every list/detail screen above should be a query hook, with mutations for create/update/delete invalidating the relevant query keys.
- **Zustand** is reserved for genuinely client-only state — auth/session state, UI state (open modals, active tab, draft form state for the announcement editor), not a duplicate cache of server data.

## Definition of Done

- [ ] Every endpoint listed across Phases 1-5 has a corresponding screen or is deliberately deferred with a noted reason
- [ ] Role-based route access works and cannot be bypassed by direct URL navigation (server-side check, not just hidden nav links)
- [ ] Kiosk-owner views never render or fetch another kiosk's data, even transiently
- [ ] Announcement visual editor produces output the desktop agent (Phase 4) can render correctly on the kiosk screen
- [ ] Pending vs. confirmed commission is visually unambiguous everywhere it's shown
