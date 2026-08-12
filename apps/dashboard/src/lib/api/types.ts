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
