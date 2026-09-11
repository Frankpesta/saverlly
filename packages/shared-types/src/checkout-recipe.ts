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
}
