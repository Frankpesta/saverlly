// Prefer amounts anchored to a currency symbol or code. Cart-total elements often
// also contain an item count (e.g. "3 items - $42.50"), and a bare-number match would
// pick up the "3" instead of the price.
const CURRENCY_SYMBOL_AMOUNT = /[$€£¥]\s?-?\d[\d,]*(?:\.\d+)?/;
const CURRENCY_CODE_AMOUNT = /(?:USD|EUR|GBP|CAD|AUD)\s?-?\d[\d,]*(?:\.\d+)?|-?\d[\d,]*(?:\.\d+)?\s?(?:USD|EUR|GBP|CAD|AUD)/i;
const DECIMAL_AMOUNT = /-?\d[\d,]*\.\d+/;
const ANY_NUMBER = /-?\d[\d,]*(?:\.\d+)?/;

/** Parses a cart-total element's text (e.g. "$1,234.56", "USD 12.00") into a number. */
export function parseCartTotal(text: string): number | null {
  const match =
    CURRENCY_SYMBOL_AMOUNT.exec(text) ??
    CURRENCY_CODE_AMOUNT.exec(text) ??
    DECIMAL_AMOUNT.exec(text) ??
    ANY_NUMBER.exec(text);
  if (!match) return null;
  const value = parseFloat(match[0].replace(/[^0-9.-]/g, ''));
  return Number.isNaN(value) ? null : value;
}

export function sortCouponsBySuccessLikelihood<T extends { successCount: number; failCount: number }>(
  coupons: T[],
): T[] {
  return [...coupons].sort((a, b) => b.successCount - a.successCount || a.failCount - b.failCount);
}
