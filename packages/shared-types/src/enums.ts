export enum UserRole {
  ADMIN = 'ADMIN',
  KIOSK_OWNER = 'KIOSK_OWNER',
  LOCATION_MANAGER = 'LOCATION_MANAGER',
}

export enum KioskStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

export enum CouponSource {
  API = 'API',
  SCRAPE = 'SCRAPE',
  MANUAL = 'MANUAL',
}

export enum AttributionMethod {
  COOKIE = 'COOKIE',
  URL_PARAM = 'URL_PARAM',
  BOTH = 'BOTH',
}

export const COUPON_TEST_RESULTS = [
  'applied',
  'failed',
  'suppressed_stepdown',
  'no_coupons_available',
] as const;

export type CouponTestResult = (typeof COUPON_TEST_RESULTS)[number];
