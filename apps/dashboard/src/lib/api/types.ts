export type UserRole = "ADMIN" | "KIOSK_OWNER" | "LOCATION_MANAGER"

export type JwtPayload = {
  sub: string
  role: UserRole
  kioskId: string | null
  exp: number
}

export type TokenPair = {
  accessToken: string
  refreshToken: string
}

export type UserProfile = {
  id: string
  email: string
  role: UserRole
  kioskId: string | null
}

export type KioskStatus = "ACTIVE" | "INACTIVE"

export type Kiosk = {
  id: string
  name: string
  status: KioskStatus
  revenueSharePct: string
  contactEmail: string
  stripeAccountId: string | null
  stripePayoutsEnabled: boolean
  createdAt: string
  updatedAt: string
}

/** A kiosk's own users are always KIOSK_OWNER or LOCATION_MANAGER — ADMIN is never kiosk-scoped. */
export type KioskAssignableRole = Extract<UserRole, "KIOSK_OWNER" | "LOCATION_MANAGER">

export type KioskUser = {
  id: string
  email: string
  role: KioskAssignableRole
  kioskId: string
  disabled: boolean
  managedLocationIds: string[]
  createdAt: string
  updatedAt: string
}

export type Location = {
  id: string
  kioskId: string
  name: string
  address: string
  city: string
  state: string
  country: string
  latitude: number | null
  longitude: number | null
  tags: string[]
  createdAt: string
  updatedAt: string
}

export type LocationSetupCode = {
  id: string
  locationId: string
  code: string
  active: boolean
  createdAt: string
}

export type Device = {
  id: string
  locationId: string
  label: string
  active: boolean
  localDeviceIdentifier: string | null
  osVersion: string | null
  lastSeenAt: string | null
  createdAt: string
  updatedAt: string
}

export type CommissionEventStatus = "PENDING" | "CONFIRMED" | "REVERSED"

export type CommissionEvent = {
  id: string
  deviceId: string
  merchantId: string
  couponId: string | null
  networkReference: string
  orderValue: number
  commissionAmount: number
  kioskShareAmount: number
  status: CommissionEventStatus
  reportedAt: string
  confirmedAt: string | null
  reversedAt: string | null
  payoutId: string | null
}

export type Balance = {
  pendingAmount: number
  confirmedAvailableAmount: number
}

export type SyncNowResult = {
  ingested: number
  confirmed: number
  reversed: number
}

export type PayoutStatus = "pending" | "processing" | "paid" | "failed"

export type Payout = {
  id: string
  kioskId: string
  kiosk?: { id: string; name: string; stripeConnected: boolean; stripePayoutsEnabled: boolean }
  periodStart: string
  periodEnd: string
  totalAmount: number
  status: PayoutStatus
  stripeTransferId: string | null
  paidAt: string | null
  createdAt: string
}

export type AttributionMethod = "COOKIE" | "URL_PARAM" | "BOTH"

export type CheckoutRecipe = {
  couponFieldSelector?: string
  applyButtonSelector?: string
  successIndicatorSelector?: string
  failureIndicatorSelector?: string
  cartTotalSelector?: string
  checkoutUrlPatterns?: string[]
}

export type Merchant = {
  id: string
  name: string
  domain: string
  attributionMethod: AttributionMethod
  affiliateTrackingUrl: string | null
  affiliateUrlParamKey: string | null
  affiliateUrlParamValue: string | null
  affiliateProgramId: string | null
  active: boolean
  checkoutRecipe: CheckoutRecipe | null
  createdAt: string
}

export type CouponSource = "API" | "SCRAPE" | "MANUAL"
export type CouponDiscountType = "percent" | "fixed" | "unknown"

export type Coupon = {
  id: string
  merchantId: string
  code: string
  description: string | null
  source: CouponSource
  discountType: CouponDiscountType | null
  discountValue: number | null
  successCount: number
  failCount: number
  lastTestedAt: string | null
  expiresAt: string | null
  active: boolean
  createdAt: string
}

export type SelectorConfig = {
  codeSelector: string
  descriptionSelector?: string
}

export type ScrapeSource = {
  id: string
  url: string
  merchantId: string | null
  selectorConfig: SelectorConfig
  intervalMinutes: number
  lastRunAt: string | null
  active: boolean
}

export type AffiliateProgram = {
  id: string
  networkName: string
  programId: string | null
  hasCouponApi: boolean
  /** apiCredentials is write-only — never returned by the API, only this derived flag. */
  hasCredentials: boolean
  createdAt: string
}

export type AnnouncementRepeatPolicy = "ONCE" | "EVERY_LOGIN" | "MAX_N_TIMES"

export type Announcement = {
  id: string
  /** null = platform-wide broadcast (ADMIN-only), shown on every device across every kiosk. */
  kioskId: string | null
  /** Location ids this announcement is scoped to — empty array = all locations for the kiosk. */
  locationIds: string[]
  title: string
  body: string
  mediaUrl: string | null
  startAt: string
  endAt: string
  repeatPolicy: AnnouncementRepeatPolicy
  maxDisplayCount: number | null
  createdAt: string
  updatedAt: string
}
