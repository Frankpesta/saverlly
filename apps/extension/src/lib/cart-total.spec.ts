import { couponsInTestOrder, parseCartTotal, sortCouponsBySuccessLikelihood, usableCoupons } from './cart-total';

describe('parseCartTotal', () => {
  it('parses a plain dollar amount', () => {
    expect(parseCartTotal('$42.50')).toBe(42.5);
  });

  it('strips thousands separators', () => {
    expect(parseCartTotal('$1,234.56')).toBe(1234.56);
  });

  it('parses a currency-code-prefixed amount', () => {
    expect(parseCartTotal('USD 12.00')).toBe(12);
  });

  it('returns null when no number is present', () => {
    expect(parseCartTotal('Free')).toBeNull();
  });

  it('picks the price over an item count that appears before it', () => {
    expect(parseCartTotal('3 items - $42.50')).toBe(42.5);
  });

  it('picks the price over an item count that appears after it', () => {
    expect(parseCartTotal('$42.50 - 3 items')).toBe(42.5);
  });
});

describe('sortCouponsBySuccessLikelihood', () => {
  it('orders by successCount descending, then failCount ascending', () => {
    const coupons = [
      { id: 'a', successCount: 1, failCount: 5 },
      { id: 'b', successCount: 3, failCount: 0 },
      { id: 'c', successCount: 3, failCount: 1 },
      { id: 'd', successCount: 0, failCount: 0 },
    ];

    expect(sortCouponsBySuccessLikelihood(coupons).map((c) => c.id)).toEqual(['b', 'c', 'a', 'd']);
  });

  it('does not mutate the input array', () => {
    const coupons = [
      { id: 'a', successCount: 1, failCount: 0 },
      { id: 'b', successCount: 2, failCount: 0 },
    ];
    const original = [...coupons];
    sortCouponsBySuccessLikelihood(coupons);
    expect(coupons).toEqual(original);
  });
});

describe('parseCartTotal decimal commas', () => {
  it('reads a European-formatted amount', () => {
    expect(parseCartTotal('€1.234,56')).toBe(1234.56);
    expect(parseCartTotal('12,50 EUR')).toBe(12.5);
  });

  it('keeps a three-digit comma group as a US thousands separator', () => {
    expect(parseCartTotal('$1,234')).toBe(1234);
  });
});

describe('usableCoupons', () => {
  const base = { active: true, expiresAt: null as string | null };
  it('drops inactive and expired coupons', () => {
    const now = Date.parse('2026-06-01T00:00:00Z');
    const result = usableCoupons(
      [
        { ...base, code: 'OK' },
        { ...base, code: 'OFF', active: false },
        { ...base, code: 'OLD', expiresAt: '2026-05-01T00:00:00Z' },
        { ...base, code: 'LATER', expiresAt: '2026-07-01T00:00:00Z' },
      ],
      now,
    );
    expect(result.map((c) => c.code)).toEqual(['OK', 'LATER']);
  });
});

describe('couponsInTestOrder', () => {
  it('sorts by likelihood and drops case-insensitive duplicates', () => {
    const result = couponsInTestOrder([
      { code: 'save10', successCount: 1, failCount: 0 },
      { code: 'BEST', successCount: 9, failCount: 0 },
      { code: 'SAVE10', successCount: 5, failCount: 0 },
    ]);
    expect(result.map((c) => c.code)).toEqual(['BEST', 'SAVE10']);
  });
});
