export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

export interface BestDiscountSummary {
  /** Highest percent-off among the merchant's active coupons, or null if none are percent-based. */
  bestPercent: number | null;
  count: number;
}

export function summarizeBestDiscount<T extends { discountType?: string | null; discountValue?: number | null }>(
  coupons: T[],
): BestDiscountSummary {
  const percentValues = coupons
    .filter((c) => c.discountType === 'percent' && typeof c.discountValue === 'number')
    .map((c) => c.discountValue as number);

  return {
    bestPercent: percentValues.length > 0 ? Math.max(...percentValues) : null,
    count: coupons.length,
  };
}
