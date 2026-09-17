import { CouponTestResult } from "./enums";

export interface CreateCouponTestEventPayload {
  /** Stable UUID for safe retry after an interrupted response. */
  eventId?: string;
  /** New clients report successful trials separately from final applied savings. */
  isFinal?: boolean;
  merchantId: string;
  couponId?: string;
  result: CouponTestResult;
  /** Confirmed cart-total delta for an "applied" result. Ignored for any other result. */
  discountAmount?: number;
}

export interface LifetimeSavingsResponse {
  lifetimeSaved: number;
}
