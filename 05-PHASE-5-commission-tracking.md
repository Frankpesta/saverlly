# Saverlly — Phase 5: Commission Tracking, Payouts & Stripe

**Prerequisite reading:** all previous phase files (00 through 04), complete and passing their Definitions of Done

## Goal

Ingest commission/conversion data from affiliate networks, attribute each commission event back to the specific device → location → kiosk that generated it, apply that kiosk's `revenueSharePct`, and produce reporting/payout data for both admin and kiosk-owners — critically enforcing that **only confirmed commission is ever payable**, with pending commission visible but not withdrawable. Integrate Stripe (Stripe Connect) so kiosk owners can actually receive payouts.

## Tech for This Phase

- Everything from prior phases
- Affiliate network adapters extended with `reportConversion` / webhook-receiving capability (network-specific — some push via webhook, some require polling a reporting API)
- **Stripe** — Stripe Connect (Express accounts recommended) for kiosk payouts, Stripe webhooks for payout status

## Data Model Additions

```prisma
enum CommissionStatus {
  PENDING
  CONFIRMED
  REVERSED
}

model CommissionEvent {
  id                String            @id @default(uuid())
  deviceId          String
  device            Device            @relation(fields: [deviceId], references: [id])
  merchantId        String
  merchant          Merchant          @relation(fields: [merchantId], references: [id])
  couponId          String?           // nullable — attribution-only sales (no coupon involved) are still valid commission events
  networkReference  String            // the affiliate network's own transaction/click ID, for reconciliation
  orderValue        Decimal           @db.Decimal(10, 2)
  commissionAmount  Decimal           @db.Decimal(10, 2)   // total commission paid by network
  kioskShareAmount  Decimal           @db.Decimal(10, 2)   // computed: commissionAmount * kiosk.revenueSharePct, finalized only on CONFIRMED
  status            CommissionStatus  @default(PENDING)
  reportedAt        DateTime
  confirmedAt       DateTime?
  reversedAt        DateTime?
  createdAt         DateTime          @default(now())
}

model Payout {
  id          String    @id @default(uuid())
  kioskId     String
  kiosk       Kiosk     @relation(fields: [kioskId], references: [id])
  periodStart DateTime
  periodEnd   DateTime
  totalAmount Decimal   @db.Decimal(10, 2) // sum of CONFIRMED kioskShareAmount only, never includes pending
  status      String    // "pending" | "processing" | "paid" | "failed"
  stripeTransferId String?
  paidAt      DateTime?
  createdAt   DateTime  @default(now())
}
```

## Attribution Logic

The hard part: matching an affiliate network's reported conversion back to a specific device/location/kiosk.

1. When the extension triggers affiliate attribution (Phase 3 — now fires on every merchant visit, not just at checkout), it should generate/capture a unique reference (a sub-ID or click-ID parameter, if the network supports pass-through tracking parameters — most major networks do, e.g., Impact's "SubId", CJ's "SID"). Encode `deviceId` (or a short device-linked token) into this sub-ID at the point of attribution.
2. Log this as a lightweight `AttributionAttempt` record (device, merchant, subId, timestamp) at attribution time — helps reconcile even if the network is slow to report, and covers merchants with no coupon involved at all.
3. When the network later reports a conversion (via webhook or polling job `syncCommissionsJob`), match it back using the sub-ID/click-ID → resolves to `deviceId` → `Device.locationId` → `Location.kioskId`.
4. Create a `CommissionEvent` with `status: PENDING` initially. **30-90 days is the typical window** (varies by merchant/network) before a network finalizes whether the sale sticks (accounting for returns/cancellations) — do not assume a fixed window; read it from the network's reporting where available, otherwise default to a configurable platform-wide estimate per network.
5. A scheduled job periodically re-checks pending events against the network's status API and updates to `CONFIRMED` or `REVERSED`.
6. On `CONFIRMED`, compute `kioskShareAmount = commissionAmount * (kiosk.revenueSharePct / 100)` and lock it in.
7. On `REVERSED`, `kioskShareAmount` is zeroed out / excluded from any future payout aggregation.

## Pending vs. Confirmed — Enforcement

This is a hard rule, not just a UI convention:

- Both admin and kiosk-owner views must clearly show **pending** commission (informational, "on the way") separately from **confirmed** commission (counted toward payable balance).
- The payout aggregation job (below) must only ever sum `CONFIRMED` events. Pending events are never included in a `Payout`, under any circumstance, even if the kiosk owner requests an early payout.
- Kiosk-owner UI should make this distinction visually obvious (e.g., "Pending: $X — not yet available" vs. "Available for payout: $Y").

## Stripe Integration

- Kiosk owners connect a **Stripe Connect Express** account from their dashboard (`POST /kiosks/:id/stripe/onboard` → returns a Stripe-hosted onboarding link). Store the resulting `stripeAccountId` on the `Kiosk` record (already added in Phase 1's schema).
- Admin's payout screen shows each kiosk's available (confirmed) balance and Stripe connection status.
- Payout execution (admin-triggered, or automatic on a schedule — confirm client preference) creates a Stripe Transfer to the kiosk's connected account for the `Payout.totalAmount`, storing the resulting `stripeTransferId`.
- Handle Stripe webhooks (`transfer.paid`, `transfer.failed`, account status changes) to keep `Payout.status` and the kiosk's Stripe connection state accurate.
- Admin also needs visibility into kiosks that haven't completed Stripe onboarding yet, since they can't receive payouts until they do (should not block them from generating commission, only from being paid out).

## Payout Generation

- A scheduled job (e.g., monthly, configurable) aggregates all `CONFIRMED` `CommissionEvent`s per kiosk for the period not already included in a prior payout, creates a `Payout` record with `status: "pending"`.
- Admin reviews/approves, then triggers the Stripe transfer (`status` moves `pending` → `processing` → `paid`/`failed` based on Stripe webhook confirmation).

## API Endpoints (this phase)

**Admin**
- `GET /commission-events` — filterable by kiosk, location, merchant, status, date range
- `GET /payouts` — all kiosks
- `POST /payouts/:id/process` — trigger the Stripe transfer for a pending payout
- `POST /commission-events/sync-now` — manually trigger the network reconciliation job

**Kiosk-owner (scoped to own kiosk)**
- `GET /my/commission-events` — their own attributed events only, with `status` clearly shown
- `GET /my/balance` — explicit split: `{ pendingAmount, confirmedAvailableAmount }`
- `GET /my/payouts` — their own payout history
- `POST /my/stripe/onboard` — get a Stripe Connect onboarding link

## Definition of Done

- [ ] A commission event from the mock/generic affiliate adapter can be ingested and correctly attributed to a device → location → kiosk, including for a merchant with no coupon involved (attribution-only)
- [ ] `kioskShareAmount` is calculated correctly using the kiosk's specific `revenueSharePct`, only finalized on `CONFIRMED`
- [ ] Pending → confirmed/reversed status transitions work via the reconciliation job
- [ ] A kiosk-owner can view only their own commission events and payouts, never another kiosk's, with pending vs. confirmed clearly separated
- [ ] Payout aggregation never includes `PENDING` or `REVERSED` events under any code path
- [ ] A kiosk owner can complete Stripe Connect onboarding and receive a test transfer
- [ ] When a real affiliate network is integrated (post-approval), its adapter correctly implements the same `reportConversion`/reconciliation interface without requiring changes to this phase's core logic
