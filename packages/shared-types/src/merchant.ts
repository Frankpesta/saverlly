import { AttributionMethod, CouponSource } from './enums';
import { CheckoutRecipe } from './checkout-recipe';

export interface PublicCoupon {
  id: string;
  merchantId: string;
  code: string;
  description: string | null;
  source: CouponSource;
  discountType: string | null;
  discountValue: number | null;
  successCount: number;
  failCount: number;
  lastTestedAt: string | null;
  expiresAt: string | null;
  active: boolean;
}

export interface PublicMerchant {
  id: string;
  name: string;
  domain: string;
  attributionMethod: AttributionMethod;
  affiliateTrackingUrl: string | null;
  affiliateUrlParamKey: string | null;
  affiliateUrlParamValue: string | null;
  active: boolean;
  checkoutRecipe: CheckoutRecipe | null;
  coupons: PublicCoupon[];
}
