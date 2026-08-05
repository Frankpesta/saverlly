import type { CouponTestResult, PublicCoupon } from '@saverlly/shared-types';

export interface CheckoutConfirmedMessage {
  type: 'CHECKOUT_CONFIRMED';
  merchantId: string;
}

export interface CouponApplyResultMessage {
  type: 'COUPON_APPLY_RESULT';
  merchantId: string;
  couponId: string | null;
  result: CouponTestResult;
}

export interface GetTabStateMessage {
  type: 'GET_TAB_STATE';
}

export interface ApplyBestCouponMessage {
  type: 'APPLY_BEST_COUPON';
}

export interface ApplyDoneMessage {
  type: 'APPLY_DONE';
  result: CouponTestResult;
}

export type ExtensionMessage =
  | CheckoutConfirmedMessage
  | CouponApplyResultMessage
  | GetTabStateMessage
  | ApplyBestCouponMessage
  | ApplyDoneMessage;

export interface TabCheckoutState {
  merchantId: string;
  merchantName: string;
  coupons: PublicCoupon[];
  suppressedStepdown: boolean;
}

// Data handed from the background service worker into an injected content script via
// a preliminary chrome.scripting.executeScript `func` call (see background/service-worker.ts) —
// the content script reads it off `window.__SAVERLLY__` once injected.
export interface InjectedCheckoutContext {
  merchantId: string;
  recipe: {
    couponFieldSelector: string;
    applyButtonSelector: string;
    successIndicatorSelector: string;
    failureIndicatorSelector: string;
    cartTotalSelector: string;
    checkoutUrlPatterns: string[];
  };
  coupons?: PublicCoupon[];
}

declare global {
  interface Window {
    __SAVERLLY__?: InjectedCheckoutContext;
  }
}
