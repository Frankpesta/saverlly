// Prefer amounts anchored to a currency symbol or code. Cart-total elements often
// also contain an item count (e.g. "3 items - $42.50"), and a bare-number match would
// pick up the "3" instead of the price.
// Digits may carry "," and "." in either role (US "1,234.56" or EU "1.234,56"); parseCartTotal
// decides which is the decimal separator.
const CURRENCY_SYMBOL_AMOUNT = /[$€£¥]\s?-?\d(?:[\d.,]*\d)?/;
const CURRENCY_CODE_AMOUNT = /(?:USD|EUR|GBP|CAD|AUD)\s?-?\d(?:[\d.,]*\d)?|-?\d(?:[\d.,]*\d)?\s?(?:USD|EUR|GBP|CAD|AUD)/i;
const DECIMAL_AMOUNT = /-?\d[\d.,]*[.,]\d+/;
const ANY_NUMBER = /-?\d[\d,]*(?:\.\d+)?/;

/** Parses a cart-total element's text (e.g. "$1,234.56", "USD 12.00") into a number. */
export function parseCartTotal(text: string): number | null {
  const match =
    CURRENCY_SYMBOL_AMOUNT.exec(text) ??
    CURRENCY_CODE_AMOUNT.exec(text) ??
    DECIMAL_AMOUNT.exec(text) ??
    ANY_NUMBER.exec(text);
  if (!match) return null;
  let amount = match[0].replace(/[^0-9.,-]/g, '');
  // "1.234,56" / "12,50": a comma followed by exactly two digits at the end is a decimal comma.
  // "1,234" (three digits) stays a US thousands separator.
  if (/,\d{2}$/.test(amount)) amount = amount.replace(/\./g, '').replace(',', '.');
  const value = parseFloat(amount.replace(/,/g, ''));
  return Number.isNaN(value) ? null : value;
}

export function sortCouponsBySuccessLikelihood<T extends { successCount: number; failCount: number }>(
  coupons: T[],
): T[] {
  return [...coupons].sort((a, b) => b.successCount - a.successCount || a.failCount - b.failCount);
}

/** Active and unexpired. Anything else must never be advertised in the popup or tried. */
export function usableCoupons<T extends { active: boolean; expiresAt: string | null }>(
  coupons: T[],
  now: number = Date.now(),
): T[] {
  return coupons.filter((c) => c.active && (!c.expiresAt || Date.parse(c.expiresAt) > now));
}

/** The exact codes a run tries, in order: most likely first, case-insensitive duplicates
 * dropped. The popup and coupon-applier both use this so counts and pill positions agree. */
export function couponsInTestOrder<T extends { code: string; successCount: number; failCount: number }>(
  coupons: T[],
): T[] {
  const seen = new Set<string>();
  return sortCouponsBySuccessLikelihood(coupons).filter((coupon) => {
    const key = coupon.code.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
