import type {
  CheckoutRecipe,
  CouponTestResult,
  PublicCoupon,
} from "@saverlly/shared-types";

export interface CheckoutConfirmedMessage {
  type: "CHECKOUT_CONFIRMED";
  merchantId: string;
  referrer: string;
}

export interface CouponApplyResultMessage {
  runId?: string;
  type: "COUPON_APPLY_RESULT";
  merchantId: string;
  couponId: string | null;
  code: string | null;
  result: CouponTestResult;
  /** True when this is the last attempt in the sequence (a success, or the final failure after
   *  exhausting every coupon). Only these should flip the popup out of the "applying" view.
   *  A non-final 'applied' result is a temporary comparison trial, not a real discount, so it
   *  is not reported to the backend (see COUPON_APPLY_RESULT handling in service-worker.ts). */
  isFinal: boolean;
  testedCount?: number;
  comparisonComplete?: boolean;
  failureReason?:
    | "comparison_unavailable"
    | "checkout_changed"
    | "restore_failed"
    | "unconfirmed"
    | "cancelled";
  /** Only set when result === 'applied'. */
  discountAmount?: number;
  originalTotal?: number;
  newTotal?: number;
}

export interface CouponApplyProgressMessage {
  runId?: string;
  type: "COUPON_APPLY_PROGRESS";
  /** Added by the worker when relaying to an extension view. */
  tabId?: number;
  phase: "testing" | "applying";
  code: string;
  index: number;
  total: number;
  testedCodes?: Array<{ code: string; saved: boolean }>;
}

export interface GetTabStateMessage {
  type: "GET_TAB_STATE";
}

export interface ApplyBestCouponMessage {
  type: "APPLY_BEST_COUPON";
}

export interface ApplyDoneMessage {
  type: "APPLY_DONE";
  tabId?: number;
  result: CouponApplyResultMessage;
}

export interface GetLifetimeSavedMessage {
  type: "GET_LIFETIME_SAVED";
}

export interface GetActivePromotionsMessage {
  type: "GET_ACTIVE_PROMOTIONS";
}

export type ExtensionMessage =
  | { type: "DEVICE_STATUS_CHANGED"; dormant: boolean }
  | {
      type: "CHECKOUT_STATE_CHANGED";
      tabId: number;
      state: TabCheckoutState | null;
    }
  | { type: "GET_EXTENSION_STATUS" | "SAVINGS_UPDATED" }
  | CheckoutConfirmedMessage
  | CouponApplyResultMessage
  | CouponApplyProgressMessage
  | GetTabStateMessage
  | ApplyBestCouponMessage
  | ApplyDoneMessage
  | GetLifetimeSavedMessage
  | GetActivePromotionsMessage;

export interface TabCheckoutState {
  checkoutUrl?: string;
  frameId?: number;
  documentId?: string;
  runId?: string;
  merchantId: string;
  merchantName: string;
  coupons: PublicCoupon[];
  suppressedStepdown: boolean;
  /** Latest progress tick from an apply run started automatically or manually. Lets a
   *  popup opened mid-run (or reopened after one finishes) restore the right view instead
   *  of always starting from a blank "idle" screen. */
  applyProgress: CouponApplyProgressMessage | null;
  /** Set only once an apply run's final attempt resolves (see CouponApplyResultMessage.isFinal). */
  applyResult: CouponApplyResultMessage | null;
}

// Data handed from the background service worker into an injected content script via
// a preliminary chrome.scripting.executeScript `func` call (see background/service-worker.ts)
// the content script reads it off `window.__SAVERLLY__` once injected.
export interface InjectedCheckoutContext {
  runId?: string;
  checkoutUrl?: string;
  merchantId: string;
  recipe: CheckoutRecipe;
  coupons?: PublicCoupon[];
}

declare global {
  interface Window {
    __SAVERLLY_APPLYING__?: boolean;
    __SAVERLLY_DETECTOR__?: () => void;
    __SAVERLLY__?: InjectedCheckoutContext;
  }
}
