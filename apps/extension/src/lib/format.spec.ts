import { formatCurrency, summarizeBestDiscount } from './format';

describe('formatCurrency', () => {
  it('formats a whole dollar amount', () => {
    expect(formatCurrency(16)).toBe('$16.00');
  });

  it('formats with thousands separators', () => {
    expect(formatCurrency(1582.32)).toBe('$1,582.32');
  });

  it('formats zero', () => {
    expect(formatCurrency(0)).toBe('$0.00');
  });
});

describe('summarizeBestDiscount', () => {
  it('picks the highest percent-off among percent-type coupons', () => {
    const coupons = [
      { discountType: 'percent', discountValue: 20 },
      { discountType: 'percent', discountValue: 36 },
      { discountType: 'fixed', discountValue: 50 },
    ];
    expect(summarizeBestDiscount(coupons)).toEqual({ bestPercent: 36, count: 3 });
  });

  it('returns null bestPercent when no coupon is percent-based', () => {
    const coupons = [
      { discountType: 'fixed', discountValue: 10 },
      { discountType: null, discountValue: null },
    ];
    expect(summarizeBestDiscount(coupons)).toEqual({ bestPercent: null, count: 2 });
  });

  it('returns count 0 for an empty list', () => {
    expect(summarizeBestDiscount([])).toEqual({ bestPercent: null, count: 0 });
  });
});
