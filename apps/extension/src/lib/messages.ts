import type {
  CheckoutRecipe,
  CouponTestResult,
  PublicCoupon,
  RecipeHealthReportPayload,
  SubmitStoreSetupRecipePayload,
} from "@saverlly/shared-types";
import type { BackupSelectors } from "./backup-promo-box";

export interface CheckoutConfirmedMessage {
  type: "CHECKOUT_CONFIRMED";
  merchantId: string;
  referrer: string;
  /** Set when the store's saved promo box is gone and an obvious one was found instead: the
   *  coupon run uses these until an admin re-checks the store (see backup-promo-box). */
  backup?: BackupSelectors;
}

/** The checkout's verdict on the store's saved recipe, for keeping stores working. */
export type RecipeHealthMessage = { type: "RECIPE_HEALTH" } & RecipeHealthReportPayload;

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
  /** Newly saved by this run, excluding a discount already present at its start. */
  incrementalSavings?: number;
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

/** Admin store setup. Accepted only from the extension's own options page and popup. */
export type StoreSetupMessage =
  | { type: "STORE_SETUP_REDEEM"; code: string }
  /** verify: also confirm with the backend that the session is still live (it may have been
   *  cancelled on the dashboard). Without it, only local state is read: no network call. */
  | { type: "STORE_SETUP_STATUS"; verify?: boolean; tabId?: number }
  | { type: "STORE_SETUP_END" }
  /** Start or stop point-and-click setup on a tab; shopper behaviour pauses there meanwhile. */
  | { type: "STORE_SETUP_START_TAB" | "STORE_SETUP_STOP_TAB"; tabId: number };

/** Sent by the setup content script on the tab being set up (top frame only). */
export type StoreSetupTabMessage =
  | { type: "STORE_SETUP_TAB_CONTEXT" }
  | { type: "STORE_SETUP_TAB_STOP" }
  | { type: "STORE_SETUP_TAB_PROGRESS"; progress: unknown }
  | { type: "STORE_SETUP_TAB_SUBMIT"; payload: SubmitStoreSetupRecipePayload };

/** The service worker's answer to STORE_SETUP_TAB_SUBMIT. */
export type StoreSetupSubmitResult = { ok: true } | { ok: false; ended: boolean; error: string };

/** What the setup content script needs to draw its panel and carry on where it left off. */
export interface StoreSetupTabContext {
  sessionId: string;
  storeName: string;
  domain: string;
  progress?: unknown;
}

/** Sent by the service worker to the setup tab when setup ends there. */
export const STORE_SETUP_OVERLAY_CLOSE = "STORE_SETUP_OVERLAY_CLOSE";

/** STORE_SETUP_STATUS with a tabId also reports on that tab. */
export interface StoreSetupTabStatus {
  /** The tab is on the store being set up. */
  onStore: boolean;
  /** Point-and-click setup is running on the tab. */
  running: boolean;
}

export type ExtensionMessage =
  | StoreSetupMessage
  | StoreSetupTabMessage
  | { type: typeof STORE_SETUP_OVERLAY_CLOSE }
  | { type: "ACTIVATE_REVIEWER"; code: string }
  | { type: "DEVICE_STATUS_CHANGED"; dormant: boolean }
  | {
      type: "CHECKOUT_STATE_CHANGED";
      tabId: number;
      state: TabCheckoutState | null;
    }
  | { type: "GET_EXTENSION_STATUS" | "SAVINGS_UPDATED" }
  | CheckoutConfirmedMessage
  | RecipeHealthMessage
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
  /** The obvious promo box found when the store's saved one is gone (CheckoutConfirmedMessage). */
  backup?: BackupSelectors;
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
    /** Set while the store setup panel is running on this page. */
    __SAVERLLY_SETUP__?: boolean;
    __SAVERLLY_DETECTOR__?: () => void;
    __SAVERLLY__?: InjectedCheckoutContext;
  }
}
