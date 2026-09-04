import type { AnnouncementLayout } from "@saverlly/shared-types"

export type UserRole = "ADMIN" | "KIOSK_OWNER" | "LOCATION_MANAGER"

export type JwtPayload = {
  sub: string
  role: UserRole
  kioskId: string | null
  mustChangePassword: boolean
  exp: number
}

export type TokenPair = {
  accessToken: string
  refreshToken: string
}

export type UserProfile = {
  id: string
  name: string | null
  avatarUrl: string | null
  email: string
  role: UserRole
  kioskId: string | null
  managedLocationIds?: string[]
  mustChangePassword?: boolean
  createdAt?: string
}

export type KioskStatus = "ACTIVE" | "INACTIVE"

export type Kiosk = {
  id: string
  name: string
  status: KioskStatus
  revenueSharePct: string
  stripeAccountId: string | null
  stripePayoutsEnabled: boolean
  createdAt: string
  updatedAt: string
}

/** A kiosk's own users are always KIOSK_OWNER or LOCATION_MANAGER, ADMIN is never kiosk-scoped. */
export type KioskAssignableRole = Extract<UserRole, "KIOSK_OWNER" | "LOCATION_MANAGER">

export type KioskUser = {
  id: string
  name: string | null
  avatarUrl: string | null
  email: string
  role: KioskAssignableRole
  kioskId: string
  disabled: boolean
  managedLocationIds: string[]
  mustChangePassword: boolean
  createdAt: string
  updatedAt: string
}

export type AdminUser = {
  id: string
  name: string | null
  avatarUrl: string | null
  email: string
  role: "ADMIN"
  kioskId: null
  disabled: boolean
  mustChangePassword: boolean
  createdAt: string
  updatedAt: string
}

/** The kiosk owner's own email doubles as the kiosk's contact. There's no separate stored
 * contact field. Returned by `/my/kiosk-contact` for a location manager who needs to reach
 * their kiosk owner. */
export type KioskContact = {
  name: string | null
  email: string | null
}

export type Location = {
  id: string
  kioskId: string
  name: string
  address: string
  city: string
  state: string
  zip: string | null
  latitude: number | null
  longitude: number | null
  tags: string[]
  /** Included on list and detail reads so the locations table can show and generate a code
   * inline, rather than it only being reachable from the location's own page. Null when the
   * location has no code yet. */
  locationSetupCode: Pick<LocationSetupCode, "id" | "code" | "active" | "createdAt"> | null
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
  /** apiCredentials is write-only. Never returned by the API, only this derived flag. */
  hasCredentials: boolean
  createdAt: string
}

export type AnnouncementRepeatPolicy = "ONCE" | "EVERY_LOGIN" | "MAX_N_TIMES"

export type Announcement = {
  id: string
  /** null = platform-wide broadcast (ADMIN-only), shown on every device across every kiosk. */
  kioskId: string | null
  /** Location ids this announcement is scoped to. Empty array = all locations for the kiosk. */
  locationIds: string[]
  /** Who wrote it. A location manager may edit or delete only their own; null belongs to nobody
   *  (it predates authorship) and stays owner-only. */
  createdById: string | null
  title: string
  /** Internal note. Never drawn on the kiosk, and nullable since the canvas editor replaced it
   *  as the source of what an announcement says. */
  body: string | null
  mediaUrl: string | null
  /** Freeform canvas design. Null for announcements created before the canvas editor. The
   *  editor and the kiosk agent both fall back to a default layout built from title/body/mediaUrl. */
  layout: AnnouncementLayout | null
  startAt: string
  endAt: string
  repeatPolicy: AnnouncementRepeatPolicy
  maxDisplayCount: number | null
  createdAt: string
  updatedAt: string
}

/**
 * An admin-authored promotion rendered inside the Chrome extension's popup. Deliberately separate
 * from Announcement (which targets the kiosk desktop overlay). Different author, audience,
 * surface and data shape.
 */
export type Promotion = {
  id: string
  /** Internal label for the admin list. Never shown to shoppers. */
  name: string
  /** 320x100 creative, rendered in the extension popup. */
  imageSmallUrl: string
  /** 728x90 leaderboard creative, held for the future on-page banner surface. */
  imageLargeUrl: string
  clickUrl: string
  /** Location tags to target, matched against Location.tags. Union with locationIds, not intersection. */
  targetTags: string[]
  /** Specific location ids to target. Union with targetTags. Both empty = show everywhere. */
  locationIds: string[]
  startAt: string
  endAt: string
  /** Manual kill switch, independent of the startAt/endAt window. */
  active: boolean
  createdAt: string
  updatedAt: string
}

export type NotificationType =
  | "KIOSK_OWNER_CREATED"
  | "LOCATION_MANAGER_CREATED"
  | "PAYOUT_PROCESSED"
  | "STRIPE_ONBOARDING_CHANGED"
  | "COMMISSION_DIGEST"

export type Notification = {
  id: string
  userId: string
  type: NotificationType
  title: string
  body: string
  metadata: Record<string, unknown> | null
  readAt: string | null
  createdAt: string
}

export type SearchResultType = "kiosk" | "location" | "device" | "merchant" | "coupon" | "announcement"

export type SearchResult = {
  type: SearchResultType
  id: string
  title: string
  subtitle: string | null
}
