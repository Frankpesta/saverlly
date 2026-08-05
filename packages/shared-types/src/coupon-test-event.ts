import { CouponTestResult } from './enums';

export interface CreateCouponTestEventPayload {
  merchantId: string;
  couponId?: string;
  result: CouponTestResult;
}
