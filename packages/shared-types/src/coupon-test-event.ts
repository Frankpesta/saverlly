import { CouponTestResult } from './enums';

export interface CreateCouponTestEventPayload {
  merchantId: string;
  couponId?: string;
  result: CouponTestResult;
  /** Confirmed cart-total delta for an "applied" result — ignored for any other result. */
  discountAmount?: number;
}

export interface LifetimeSavingsResponse {
  lifetimeSaved: number;
}
