export interface AffiliateCouponDto {
  code: string;
  description?: string;
  discountType?: string;
  discountValue?: number;
  expiresAt?: Date;
}

export type NetworkConversionStatus = 'pending' | 'confirmed' | 'reversed';

export interface AffiliateConversionDto {
  /** The sub-ID/click-ID we minted at attribution time (AttributionAttempt.subId), echoed back by the network. */
  subId: string;
  /** The network's own transaction/click ID for this conversion. Used for later reconciliation lookups. */
  networkReference: string;
  orderValue: number;
  commissionAmount: number;
  status: NetworkConversionStatus;
  reportedAt: Date;
}

export interface ConversionStatusResult {
  networkReference: string;
  status: NetworkConversionStatus;
}

export interface AffiliateNetworkAdapter {
  fetchCoupons(programId: string): Promise<AffiliateCouponDto[]>;
  /**
   * Looks up conversions for a batch of previously-minted sub-IDs that don't have a
   * CommissionEvent yet. Used for initial ingestion (Phase 5 commission sync job).
   */
  fetchConversions?(programId: string, subIds: string[]): Promise<AffiliateConversionDto[]>;
  /**
   * Re-checks current status for a batch of already-ingested conversions, by the network's
   * own reference id. Used by the reconciliation pass of the commission sync job to move
   * PENDING events to CONFIRMED/REVERSED.
   */
  checkConversionStatuses?(
    programId: string,
    networkReferences: string[],
  ): Promise<ConversionStatusResult[]>;
}
