export interface RankableCoupon {
  id: string;
  successCount: number;
  failCount: number;
  lastSeenAt: Date | null;
}

/**
 * Chance the code works, smoothed so one result doesn't decide it: (wins + 1) / (tries + 2).
 * A new code scores 0.5, so it is tried ahead of one that failed 10 times out of 11 (0.15)
 * instead of behind it, as the old successCount-first order put it.
 */
export function successScore(
  coupon: Pick<RankableCoupon, 'successCount' | 'failCount'>,
): number {
  return (
    (coupon.successCount + 1) / (coupon.successCount + coupon.failCount + 2)
  );
}

/**
 * The order the extension tries codes in: likeliest to work first, then the code more coupon
 * sites agree on (`recentSites`: sites that saw it within the freshness window), then the one
 * seen most recently. Ties fall back to id so the order is stable.
 */
export function rankCoupons<T extends RankableCoupon>(
  coupons: T[],
  recentSites: (coupon: T) => number,
): T[] {
  return [...coupons].sort(
    (a, b) =>
      successScore(b) - successScore(a) ||
      recentSites(b) - recentSites(a) ||
      (b.lastSeenAt?.getTime() ?? 0) - (a.lastSeenAt?.getTime() ?? 0) ||
      a.id.localeCompare(b.id),
  );
}
