# Saverlly — Phase 2: Coupon Engine & Affiliate Tracking

**Prerequisite reading:** `00-PROJECT-OVERVIEW.md`, `01-PHASE-1-core-platform.md` (must be complete and passing its Definition of Done)

## Goal

Build the merchant/coupon data model, manual coupon entry, the scraping subsystem, affiliate network API integration scaffolding, and the "merchant recipe" system that will later let the Chrome extension know how to interact with each store's checkout page. Critically, this phase must clearly separate two independent concerns that were previously conflated:

1. **Coupon sourcing** — how coupon *codes* get into the system (API, scrape, or manual)
2. **Affiliate tracking/attribution** — how a *sale* gets credited to the platform (cookie or URL-parameter based), which must work for every affiliated merchant regardless of whether that merchant has a coupon API

A merchant can have tracking without an API-based coupon feed, and vice versa is not really possible (tracking is required for any merchant we want commission from at all) — every `Merchant` record needs an attribution method, but coupon source is independently configured.

## Tech for This Phase

- Everything from Phase 1, plus:
- BullMQ + Redis for background jobs (scrape runs, affiliate feed sync)
- Playwright for scraping
- Adapter pattern for affiliate network integrations (one adapter class per network)

## Data Model Additions

```prisma
enum CouponSource {
  API
  SCRAPE
  MANUAL
}

enum AttributionMethod {
  COOKIE
  URL_PARAM
  BOTH
}

model AffiliateProgram {
  id          String     @id @default(uuid())
  networkName String     // e.g. "Impact", "CJ Affiliate", "Rakuten" — nullable/omitted if merchant has no network, just a direct tracking link
  programId   String?
  apiCredentials Json?    // encrypted at rest — store only encrypted blobs, never plaintext keys; null if no API available
  hasCouponApi   Boolean  @default(false) // explicit flag: this program can feed coupon codes automatically
  merchants   Merchant[]
  createdAt   DateTime   @default(now())
}

model Merchant {
  id                    String            @id @default(uuid())
  name                  String
  domain                String            @unique // e.g. "target.com"
  affiliateProgramId    String?
  affiliateProgram      AffiliateProgram? @relation(fields: [affiliateProgramId], references: [id])
  attributionMethod     AttributionMethod // required — every merchant needs a tracking method to earn commission at all
  affiliateTrackingUrl  String?           // base URL used to set the tracking cookie, if COOKIE or BOTH
  affiliateUrlParamKey  String?           // query param name to append (e.g. "irclickid"), if URL_PARAM or BOTH
  affiliateUrlParamValue String?          // the platform's own affiliate/tracking ID value to inject
  active                Boolean           @default(true)
  checkoutRecipe        Json?             // see "Merchant Recipe" section below
  coupons               Coupon[]
  createdAt             DateTime          @default(now())
}

model Coupon {
  id            String        @id @default(uuid())
  merchantId    String
  merchant      Merchant      @relation(fields: [merchantId], references: [id])
  code          String
  description   String?
  source        CouponSource
  discountType  String?       // "percent" | "fixed" | "unknown"
  discountValue Float?
  successCount  Int           @default(0)
  failCount     Int           @default(0)
  lastTestedAt  DateTime?
  expiresAt     DateTime?
  active        Boolean       @default(true)
  createdAt     DateTime      @default(now())
}

model ScrapeSource {
  id          String    @id @default(uuid())
  url         String
  merchantId  String?   // optional — some scrape sources cover multiple merchants
  selectorConfig Json   // CSS selectors for code extraction
  lastRunAt   DateTime?
  active      Boolean   @default(true)
}
```

## Adding a Store — Unified Flow

When admin adds a new merchant, the flow should let them configure coupon sourcing and tracking independently:

1. **Basic info**: name, domain
2. **Tracking method (required)**: choose `COOKIE`, `URL_PARAM`, or `BOTH`, and supply the corresponding tracking URL / param key+value. This is what makes commission attribution work — this step is mandatory even if the store has no coupon API at all.
3. **Coupon sourcing (choose any combination, none required at creation time)**:
   - Connect an affiliate API (select network, enter credentials) — only shown/relevant if the store's program supports it (`hasCouponApi: true`)
   - Add a scrape source (URL + selector config)
   - Leave it empty and rely purely on manual entry later
4. A store with `hasCouponApi: false` (or no `AffiliateProgram` at all, just a direct tracking link) is **fully valid** — it just means coupon codes for it come from scraping/manual entry, while commission tracking still works normally via its `attributionMethod`.

## Merchant Recipe (`checkoutRecipe` JSON shape)

This is the config the Chrome extension (Phase 3) will fetch and use to interact with a specific merchant's checkout page. Define and store it here even though it's consumed in Phase 3.

```json
{
  "couponFieldSelector": "input[name='promoCode']",
  "applyButtonSelector": "button[data-testid='apply-promo']",
  "successIndicatorSelector": ".promo-success-message",
  "failureIndicatorSelector": ".promo-error-message",
  "cartTotalSelector": ".order-summary-total",
  "checkoutUrlPatterns": ["/checkout", "/cart/checkout"]
}
```

This should be editable from the admin console as a structured form (not raw JSON in the UI) — build simple field inputs mapped to this schema.

## Coupon Sourcing — Three Methods

1. **Manual entry** (build first — no dependencies): Admin console CRUD form for `Coupon` records against a `Merchant`.
2. **Scraping**: `ScrapeSource` records define a URL + selector config. A BullMQ job (`scrapeCouponsJob`) runs Playwright against each active `ScrapeSource` on a schedule (configurable per source, default daily), extracts codes, upserts into `Coupon` with `source: SCRAPE`. Deduplicate by `(merchantId, code)`.
3. **Affiliate network API**: One adapter class per network implementing a shared interface:
   ```ts
   interface AffiliateNetworkAdapter {
     fetchCoupons(programId: string): Promise<CouponDTO[]>;
     reportConversion?(eventData): Promise<void>; // used in Phase 5
   }
   ```
   Start with a generic/mock adapter for development; real network adapters (Impact, CJ, Rakuten, etc.) get implemented as the client confirms which networks he's signed up with. A BullMQ job (`syncAffiliateFeedJob`) runs each adapter's `fetchCoupons` on a schedule and upserts results with `source: API`. This job should simply be skipped for merchants where `hasCouponApi: false` — not an error state.

## API Endpoints (this phase)

**Merchants** (admin)
- `POST /merchants` — includes tracking method fields (required) and optional coupon-sourcing config
- `GET /merchants`
- `GET /merchants/:id`
- `PATCH /merchants/:id` — includes `checkoutRecipe`, `attributionMethod`, tracking fields
- `DELETE /merchants/:id`

**Coupons** (admin for manual entry; scrape/API-sourced coupons are system-created)
- `POST /coupons` (manual)
- `GET /coupons?merchantId=...`
- `PATCH /coupons/:id`
- `DELETE /coupons/:id`

**Scrape Sources** (admin)
- `POST /scrape-sources`
- `GET /scrape-sources`
- `PATCH /scrape-sources/:id`
- `POST /scrape-sources/:id/run-now` — manually trigger a scrape job outside the schedule

**Affiliate Programs** (admin)
- `POST /affiliate-programs` — `hasCouponApi` flag set explicitly
- `GET /affiliate-programs`
- `PATCH /affiliate-programs/:id`

**Device-facing (consumed by extension in Phase 3 — build now, use later)**
- `GET /public/merchants/by-domain/:domain` — returns merchant + active coupons + checkoutRecipe + attribution config, if merchant is active. Requires valid device token.
- `POST /public/coupon-test-events` — extension reports which coupon(s) it tried and the result (stubbed fully in Phase 3, but the endpoint and `CouponTestEvent` table should exist now)

```prisma
model CouponTestEvent {
  id          String   @id @default(uuid())
  deviceId    String
  couponId    String?  // nullable — a step-down suppression event or a manual trigger with no matching coupon has no couponId
  merchantId  String
  result      String   // "applied" | "failed" | "suppressed_stepdown" | "no_coupons_available"
  createdAt   DateTime @default(now())
}
```

## Definition of Done

- [ ] Merchant + Coupon CRUD works end-to-end from admin console
- [ ] A merchant can be created with a tracking method and zero coupon-sourcing methods, and is treated as fully valid
- [ ] A `checkoutRecipe` can be saved and retrieved per merchant
- [ ] At least one scrape source runs successfully via BullMQ and creates real `Coupon` records
- [ ] A mock/generic affiliate adapter runs on schedule and upserts coupons only for merchants with `hasCouponApi: true`
- [ ] `GET /public/merchants/by-domain/:domain` returns correct data (including attribution config) given a valid device token, and 401s without one
- [ ] Duplicate coupons (same merchant + code) are not created on repeat scrape/sync runs
