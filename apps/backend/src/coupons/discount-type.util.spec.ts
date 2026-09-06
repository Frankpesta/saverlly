import { CouponDiscountType } from '@prisma/client';
import { normalizeDiscountType } from './discount-type.util';

describe('normalizeDiscountType', () => {
  it('maps "percent" (any case) to PERCENT', () => {
    expect(normalizeDiscountType('percent')).toBe(CouponDiscountType.PERCENT);
    expect(normalizeDiscountType('PERCENT')).toBe(CouponDiscountType.PERCENT);
  });

  it('maps "fixed" (any case) to FIXED', () => {
    expect(normalizeDiscountType('fixed')).toBe(CouponDiscountType.FIXED);
    expect(normalizeDiscountType('Fixed')).toBe(CouponDiscountType.FIXED);
  });

  it('falls back to UNKNOWN for a value no network is known to send, rather than throwing', () => {
    expect(normalizeDiscountType('amount_off')).toBe(CouponDiscountType.UNKNOWN);
  });

  it('falls back to UNKNOWN for undefined/null', () => {
    expect(normalizeDiscountType(undefined)).toBe(CouponDiscountType.UNKNOWN);
    expect(normalizeDiscountType(null)).toBe(CouponDiscountType.UNKNOWN);
  });
});
