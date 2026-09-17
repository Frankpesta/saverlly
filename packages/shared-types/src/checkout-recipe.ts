export interface CheckoutRecipe {
  couponFieldSelector: string;
  applyButtonSelector: string;
  successIndicatorSelector: string;
  failureIndicatorSelector: string;
  cartTotalSelector: string;
  checkoutUrlPatterns: string[];
  // Optional: some checkouts (e.g. Target) hide the coupon field/apply button behind a
  // click-to-reveal trigger (a "+ Add promo code" button) that isn't in the DOM until clicked.
  // When set, its presence alone counts as evidence of a coupon mechanism for detection, and
  // the apply flow clicks it before looking for couponFieldSelector/applyButtonSelector.
  couponFieldRevealSelector?: string;
  /** Confirmed merchant behavior. Required to compare multiple codes safely. */
  couponApplyMode?: "replace" | "remove";
  /** Removes the code applied by this run; must not clear unrelated cart items. */
  removeCouponSelector?: string;
}
/** Repair JSON-escaped attribute quotes pasted into a plain CSS selector field. */
export function normalizeCheckoutSelector(value: string): string {
  return value
    .trim()
    .replace(/=\\"([^"\]]*)\\"\]/g, '="$1"]')
    .replace(/=\\'([^'\]]*)\\'\]/g, "='$1']");
}
