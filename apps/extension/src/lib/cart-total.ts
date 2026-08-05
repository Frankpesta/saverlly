/** Parses a cart-total element's text (e.g. "$1,234.56", "USD 12.00") into a number. */
export function parseCartTotal(text: string): number | null {
  const match = text.replace(/,/g, '').match(/-?\d+(\.\d+)?/);
  if (!match) return null;
  const value = parseFloat(match[0]);
  return Number.isNaN(value) ? null : value;
}

export function sortCouponsBySuccessLikelihood<T extends { successCount: number; failCount: number }>(
  coupons: T[],
): T[] {
  return [...coupons].sort((a, b) => b.successCount - a.successCount || a.failCount - b.failCount);
}
