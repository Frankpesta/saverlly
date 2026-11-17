import { rankCoupons, successScore } from './coupon-ranking';

const coupon = (
  id: string,
  successCount = 0,
  failCount = 0,
  lastSeenAt: Date | null = null,
) => ({ id, successCount, failCount, lastSeenAt });

describe('coupon ranking', () => {
  it('smooths the success rate so a new code beats a mostly failing one', () => {
    expect(successScore(coupon('new'))).toBe(0.5);
    expect(successScore(coupon('bad', 1, 10))).toBeCloseTo(2 / 13);
    const ranked = rankCoupons(
      [coupon('bad', 1, 10), coupon('new'), coupon('good', 5, 0)],
      () => 0,
    );
    expect(ranked.map((c) => c.id)).toEqual(['good', 'new', 'bad']);
  });

  it('breaks ties by how many coupon sites list the code, then by recency', () => {
    const sites: Record<string, number> = { one: 1, two: 2, older: 1 };
    const ranked = rankCoupons(
      [
        coupon('older', 0, 0, new Date('2026-11-01')),
        coupon('one', 0, 0, new Date('2026-11-10')),
        coupon('two', 0, 0, new Date('2026-11-01')),
        coupon('never', 0, 0, null),
      ],
      (c) => sites[c.id] ?? 0,
    );
    expect(ranked.map((c) => c.id)).toEqual(['two', 'one', 'older', 'never']);
  });

  it('keeps a stable order for complete ties and leaves the input alone', () => {
    const input = [coupon('b'), coupon('a')];
    expect(rankCoupons(input, () => 0).map((c) => c.id)).toEqual(['a', 'b']);
    expect(input.map((c) => c.id)).toEqual(['b', 'a']);
  });
});
