import { CouponDiscountType } from '@prisma/client';

/**
 * Maps a raw external string (an affiliate network's own free-text field, not validated
 * against our enum) into CouponDiscountType. Anything not recognized -- including a value a
 * network invents that we've never seen -- falls back to UNKNOWN rather than throwing, since
 * this runs inside a scheduled sync job processing many merchants' coupons in one pass; one
 * merchant's odd value must not fail the whole run for every other merchant.
 */
export function normalizeDiscountType(
  raw: string | undefined | null,
): CouponDiscountType {
  switch (raw?.toLowerCase()) {
    case 'percent':
      return CouponDiscountType.PERCENT;
    case 'fixed':
      return CouponDiscountType.FIXED;
    default:
      return CouponDiscountType.UNKNOWN;
  }
}
