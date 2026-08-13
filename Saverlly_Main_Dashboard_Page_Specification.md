# Admin Dashboard & Kiosk Owner Dashboard

**Frontend design specification for Claude Code**
*All APIs are already built — use the existing APIs only.*

This document contains only the dashboard-page specification discussed earlier: the actual first screen after login, including KPI cards, charts, operational widgets, recent activity, and recommended page layouts.

---

## 1. Kiosk Owner — Main Dashboard

**Primary goal:** answer within a few seconds how the kiosk is performing, how much has been earned, what is pending, whether devices are working, and what happened recently.

### Top Header

- Welcome message: "Good morning/afternoon, [Kiosk Owner Name]".
- Show kiosk status: ACTIVE / INACTIVE.
- Show number of locations.
- Show number of active devices.
- Show recent/last activity when available.
- Primary action: **+ Add Location** (or another contextually useful primary action).

### Row 1 — Financial KPI Cards

| # | Card | Value | Subtext | Notes |
|---|------|-------|---------|-------|
| 1 | Available Balance | ₦245,800.00 | +12.4% this month | Represents confirmed commissions that are available/payable. Do **not** include pending commissions. |
| 2 | Pending Balance | ₦81,450.00 | Awaiting confirmation | Must be clearly separated from Available Balance. Pending commissions are not payable until confirmed. |
| 3 | Total Earnings | ₦1,284,500.00 | Lifetime | — |
| 4 | Total Paid Out | ₦1,038,700.00 | 12 payouts | — |

### Row 2 — Operational KPI Cards

| # | Card | Value | Subtext | Notes |
|---|------|-------|---------|-------|
| 5 | Locations | 8 | 7 active | — |
| 6 | Devices | 42 | 39 active, 3 disabled | — |
| 7 | Commission Events | 1,284 | +18.6% this month | Only show growth percentages if the API provides the required comparison data. |
| 8 | Device Health | 92.8% | 39 / 42 online | Use last-seen/device status data from the existing API. Do not fabricate an online percentage if the API does not provide enough information. |

### Main Dashboard Content

#### 1. Earnings Overview Chart

- Large primary chart on the dashboard.
- Show confirmed earnings over time.
- Suggested time filters: 7 Days, 30 Days, 3 Months, 6 Months, 1 Year, where supported.

```
Earnings Overview

₦
│      ╭───╮
│  ╭───╯   ╰──╮
│ ╭╯           ╰
│╭╯
└──────────────────────────────
 Jan Feb Mar Apr May Jun Jul Aug
```

#### 2. Commission Breakdown

- Clearly distinguish Confirmed, Pending, and Reversed.

```
Commission Overview

Confirmed   ₦245,800
Pending      ₦81,450
Reversed     ₦12,300

[View commissions →]
```

### Row Below

#### 3. Device Health

- Show device status and last-seen information where available.
- Link to the full Devices page.

```
Device Health                              View all →

Active 39   Disabled 3

Location        Devices  Status
──────────────────────────────────────
Lagos Branch     12      ● Healthy
Ikeja Branch      8      ● Healthy
Lekki Branch     15      ● Healthy
Yaba Branch       7      ⚠ 1 Offline
```

#### 4. Locations Overview

- Clicking a location should open its detail page.

```
Your Locations                             View all →

Location         Devices  Status
──────────────────────────────────────
Lagos Central     12      Active
Ikeja              8      Active
Lekki             15      Active
Yaba               7      Active
```

### Bottom Section

#### 5. Recent Commission Activity

- Status badges: Confirmed, Pending, Reversed.
- Use the existing commission API.

```
Recent Commissions                         View all →

Merchant   Device    Amount    Status
──────────────────────────────────────────────
Amazon     KSK-023   ₦8,450    Confirmed
Jumia      KSK-018   ₦4,200    Pending
Nike       KSK-031   ₦12,800   Confirmed
Temu       KSK-009   ₦3,100    Pending
```

#### 6. Recent Payouts

```
Recent Payouts                             View all →

Date     Amount     Status
─────────────────────────────────────
Aug 10   ₦120,000   Paid
Jul 28    ₦95,500   Paid
Jul 15    ₦84,200   Paid
```

#### 7. Announcements

- Show the owner's latest announcements.
- Respect the existing announcement targeting and repeat-policy data.

```
Announcements

📢 New promotional campaign
   All locations · 2 hours ago

📢 System maintenance
   Selected locations · Yesterday

[View announcements →]
```

### Kiosk Owner — Recommended Visual Layout

```
┌─────────────────────────────────────────────────────────────┐
│ Good morning, John                          + Add Location   │
│ Kiosk: ACTIVE                                                 │
├────────────────┬────────────────┬────────────────┬───────────┤
│ Available       │ Pending        │ Total Earnings │ Paid Out  │
│ ₦245,800        │ ₦81,450        │ ₦1.28M         │ ₦1.03M    │
├────────────────┼────────────────┼────────────────┼───────────┤
│ Locations       │ Devices        │ Commission     │ Device    │
│ 8               │ 42             │ Events         │ Health    │
│ 7 active        │ 39 active      │ 1,284          │ 92.8%     │
├──────────────────────────────────────┬──────────────────────┤
│                                       │ Commission Breakdown │
│ Earnings Overview                    │                       │
│ CHART                                │ Confirmed             │
│                                       │ Pending               │
│                                       │ Reversed              │
├──────────────────────────────────────┼──────────────────────┤
│ Device Health                        │ Locations             │
│ Device status table                  │ Location summary      │
├──────────────────────────────────────┴──────────────────────┤
│ Recent Commission Activity                                    │
├──────────────────────────────────────┬──────────────────────┤
│ Recent Payouts                       │ Announcements         │
└──────────────────────────────────────┴──────────────────────┘
```

---

## 2. Admin — Main Dashboard

**Primary goal:** give the administrator an immediate view of what is happening across the entire platform and highlight financial, kiosk, device, merchant, coupon, and payout issues.

### Row 1 — Platform KPI Cards

| # | Card | Value | Subtext | Notes |
|---|------|-------|---------|-------|
| 1 | Total Kiosks | 248 | 231 active, 17 inactive | — |
| 2 | Total Locations | 1,084 | +8.2% this month | Show growth only when the API provides comparable period data. |
| 3 | Active Devices | 4,892 | 97.4% online | — |
| 4 | Total Commissions | ₦84.2M | +14.8% this month | — |
| 5 | Pending Commissions | ₦18.6M | Awaiting confirmation | — |
| 6 | Confirmed Commissions | ₦65.6M | +11.4% this month | — |

**Recommended additional financial KPI cards:**

- Total Paid Out / Payouts Processed.
- Coupon Success Rate.
- Only add these as top-level cards if the API provides the data cleanly; otherwise place them in dashboard panels.

### Row 2 — Platform Performance

#### 1. Commission Revenue / Performance Chart

- This should be the largest visual element on the Admin dashboard.
- Show commission trend over time.
- Suggested filters: 7D, 30D, 3M, 6M, 1Y.
- Where supported, allow filtering by kiosk or merchant.

```
Commission Performance

₦
│       ╭────╮
│   ╭───╯    ╰──╮
│ ╭─╯            ╰
│╭╯
└────────────────────────────────
 Jan Feb Mar Apr May Jun Jul Aug
```

#### 2. Commission Status Breakdown

```
Commission Status

Confirmed   ₦65.6M   77.9%
Pending     ₦18.6M   22.1%
Reversed     ₦2.4M

[View all commissions]
```

### Row 3 — Platform Health

#### 3. Kiosk Status

```
Kiosk Status

231
ACTIVE

17
INACTIVE
```

- A donut/pie visualization is appropriate here.

#### 4. Device Health

```
Device Health

● Active    4,892
● Disabled    143
● Offline      76

97.4% healthy
```

- Use actual device status/last-seen API data.

#### 5. Merchant / Coupon Performance

```
Coupon Performance

Total Attempts   48,291
Successful       31,824
Failed           16,467

Success Rate     65.9%

[View coupon analytics]
```

- Use the existing coupon performance API.
- Do not calculate financial/business truth differently from the backend.

### Row 4 — Top Performers

#### 6. Top Kiosks

- Rank by the period selected in the dashboard when the API supports period filtering.

```
Top Performing Kiosks                      View all →

#   Kiosk           Commission
1   Kiosk Lagos     ₦4.82M
2   Kiosk Abuja     ₦3.91M
3   Kiosk Port H.   ₦3.42M
4   Kiosk Ibadan    ₦2.88M
5   Kiosk Enugu     ₦2.61M
```

#### 7. Top Merchants

```
Top Merchants                              View all →

Merchant   Commissions   Coupon Success
Amazon     ₦8.4M         72%
Nike       ₦6.9M         68%
Jumia      ₦5.8M         64%
```

### Row 5 — Financial Operations

#### 8. Payout Overview

- Use existing payout APIs and Stripe status data.

```
Payout Overview

Available for payout   ₦12.8M
Pending payouts         ₦4.2M
Paid this month        ₦18.4M

[Manage payouts →]
```

#### 9. Recent Commission Events

```
Recent Commission Events

Merchant   Kiosk    Amount     Status
Amazon     Lagos    ₦45,200    Confirmed
Nike       Abuja    ₦18,400    Pending
Jumia      Enugu    ₦12,800    Confirmed
```

### Row 6 — Needs Attention

**Strongly recommended:** make this an operational panel rather than another statistics card.

```
Needs Attention

⚠ 17 kiosks are inactive
  Review kiosk status

⚠ 143 devices are disabled
  View devices

⚠ 8 merchants have low coupon success rates
  Review merchants

⚠ ₦4.2M in payouts awaiting processing
  Review payouts

⚠ 23 affiliate integrations need attention
  View integrations
```

- Only show an alert when corresponding API data exists.
- Do not invent thresholds or alerts that are not supported by the backend.
- If the API does not provide integration health, omit that alert.

### Row 7 — Recent Activity

#### 10. Recent Platform Activity

- Use the existing activity/audit API.
- Show actor/action/target/time when those fields are available.

```
Recent Activity

● Kiosk "Lagos Central" was activated
  4 minutes ago

● ₦245,000 commission confirmed
  12 minutes ago

● Device KSK-482 disabled
  18 minutes ago

● New merchant "Nike" configured
  32 minutes ago

● ₦120,000 payout processed
  1 hour ago

[View all activity]
```

### Admin — Recommended Visual Layout

```
┌────────────────────────────────────────────────────────────────────┐
│ Good morning, Admin                            Date / Search        │
├────────────┬────────────┬────────────┬────────────┬────────────────┤
│ Kiosks     │ Locations  │ Devices    │ Commissions│ Pending         │
│ 248        │ 1,084      │ 4,892      │ ₦84.2M     │ ₦18.6M          │
├────────────┴────────────┴────────────┴────────────┴────────────────┤
│                                                                       │
│  COMMISSION PERFORMANCE                                              │
│  LARGE CHART                                                         │
│                                                                       │
├──────────────────────────────────────┬───────────────────────────────┤
│ Commission Breakdown                 │ Kiosk Status                  │
│ Confirmed / Pending / Reversed       │ Active / Inactive             │
├──────────────────────────────────────┼───────────────────────────────┤
│ Device Health                        │ Coupon Performance             │
│ Active / Disabled / Offline          │ Success / Failure              │
├──────────────────────────────────────┼───────────────────────────────┤
│ Top Kiosks                           │ Top Merchants                  │
├──────────────────────────────────────┼───────────────────────────────┤
│ Payout Overview                      │ Needs Attention                │
├──────────────────────────────────────┴───────────────────────────────┤
│ Recent Commission Events                                              │
├────────────────────────────────────────────────────────────────────┤
│ Recent Platform Activity                                              │
└────────────────────────────────────────────────────────────────────┘
```

---

## 3. Dashboard Design Principles

### Kiosk Owner Priority

**Money → Devices → Locations → Commissions → Payouts**

- The owner dashboard should feel like a financial and kiosk-operations dashboard.
- Financial cards should have the strongest hierarchy.
- Do not overwhelm the first screen with detailed tables; show summaries and link to detail pages.

### Admin Priority

**Platform Performance → Money → Kiosks/Devices → Merchants/Coupons → Payouts → Alerts**

- The Admin dashboard should feel like a platform operations center.
- Use the large commission chart as the primary visual.
- Needs Attention should make operational problems immediately visible.

---

## 4. Frontend Implementation Notes

- All APIs are already built.
- Do not create new backend endpoints just to satisfy a visual metric, unless explicitly necessary.
- If a metric is not available from the API, check if it is possible to create it.
- Every widget needs loading, empty, and error states.
- Every card that represents a navigable module should have a clear View all / View details action.
- Use responsive stacking on mobile; do not force wide dashboard tables to overflow the entire page.
- Financial values must be formatted consistently and must preserve backend precision/meaning.
- Pending commission must never be displayed as available/payable balance.
- All role/tenant restrictions must be respected by the existing backend authorization.
