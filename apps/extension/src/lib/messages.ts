import type { CheckoutRecipe, CouponTestResult, PublicCoupon } from '@saverlly/shared-types';

export interface CheckoutConfirmedMessage {
  type: 'CHECKOUT_CONFIRMED';
  merchantId: string;
  referrer: string;
}

export interface CouponApplyResultMessage {
  type: 'COUPON_APPLY_RESULT';
  merchantId: string;
  couponId: string | null;
  code: string | null;
  result: CouponTestResult;
  /** True when this is the last attempt in the sequence (a success, or the final failure after
   *  exhausting every coupon) — only these should flip the popup out of the "applying" view.
   *  Every attempt is still reported to the backend regardless of this flag. */
  isFinal: boolean;
  /** Only set when result === 'applied'. */
  discountAmount?: number;
  originalTotal?: number;
  newTotal?: number;
}

export interface CouponApplyProgressMessage {
  type: 'COUPON_APPLY_PROGRESS';
  phase: 'testing' | 'applying';
  code: string;
  index: number;
  total: number;
}

export interface GetTabStateMessage {
  type: 'GET_TAB_STATE';
}

export interface ApplyBestCouponMessage {
  type: 'APPLY_BEST_COUPON';
}

export interface ApplyDoneMessage {
  type: 'APPLY_DONE';
  result: CouponApplyResultMessage;
}

export interface GetLifetimeSavedMessage {
  type: 'GET_LIFETIME_SAVED';
}

export interface GetActivePromotionsMessage {
  type: 'GET_ACTIVE_PROMOTIONS';
}

export type ExtensionMessage =
  | CheckoutConfirmedMessage
  | CouponApplyResultMessage
  | CouponApplyProgressMessage
  | GetTabStateMessage
  | ApplyBestCouponMessage
  | ApplyDoneMessage
  | GetLifetimeSavedMessage
  | GetActivePromotionsMessage;

export interface TabCheckoutState {
  merchantId: string;
  merchantName: string;
  coupons: PublicCoupon[];
  suppressedStepdown: boolean;
  /** Latest progress tick from an apply run started automatically or manually — lets a
   *  popup opened mid-run (or reopened after one finishes) restore the right view instead
   *  of always starting from a blank "idle" screen. */
  applyProgress: CouponApplyProgressMessage | null;
  /** Set only once an apply run's final attempt resolves (see CouponApplyResultMessage.isFinal). */
  applyResult: CouponApplyResultMessage | null;
}

// Data handed from the background service worker into an injected content script via
// a preliminary chrome.scripting.executeScript `func` call (see background/service-worker.ts) —
// the content script reads it off `window.__SAVERLLY__` once injected.
export interface InjectedCheckoutContext {
  merchantId: string;
  recipe: CheckoutRecipe;
  coupons?: PublicCoupon[];
}

declare global {
  interface Window {
    __SAVERLLY__?: InjectedCheckoutContext;
  }
}
