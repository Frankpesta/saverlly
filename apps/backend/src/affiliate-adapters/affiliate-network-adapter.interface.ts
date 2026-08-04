export interface AffiliateCouponDto {
  code: string;
  description?: string;
  discountType?: string;
  discountValue?: number;
  expiresAt?: Date;
}

// Shape TBD — reportConversion is a Phase 5 concern (commission ingestion). Declared now so
// the interface is stable once real adapters implement it; unused until then.
export type ReportConversionData = Record<string, unknown>;

export interface AffiliateNetworkAdapter {
  fetchCoupons(programId: string): Promise<AffiliateCouponDto[]>;
  reportConversion?(eventData: ReportConversionData): Promise<void>;
}
