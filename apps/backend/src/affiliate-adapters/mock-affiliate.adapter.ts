import { Injectable } from '@nestjs/common';
import {
  AffiliateConversionDto,
  AffiliateCouponDto,
  AffiliateNetworkAdapter,
  ConversionStatusResult,
} from './affiliate-network-adapter.interface';

/**
 * Generic/mock adapter for development. Used for every network until a real,
 * network-specific adapter (Impact, CJ Affiliate, Rakuten, etc.) is implemented
 * once the client confirms which networks they're actually signed up with.
 */
@Injectable()
export class MockAffiliateAdapter implements AffiliateNetworkAdapter {
  async fetchCoupons(programId: string): Promise<AffiliateCouponDto[]> {
    const suffix = programId.slice(0, 6).toUpperCase();
    return [
      {
        code: `MOCK10-${suffix}`,
        description: 'Mock 10% off (generic adapter)',
        discountType: 'percent',
        discountValue: 10,
      },
      {
        code: `MOCKSHIP-${suffix}`,
        description: 'Mock free shipping (generic adapter)',
        discountType: 'fixed',
        discountValue: 0,
      },
    ];
  }

  // Fabricates a pending conversion for every sub-ID handed to it. Every real network only
  // reports conversions it actually saw, so a real adapter's hit rate is far from 100%, but a
  // deterministic 100% hit rate is what makes this useful for exercising the ingestion job in dev.
  async fetchConversions(_programId: string, subIds: string[]): Promise<AffiliateConversionDto[]> {
    return subIds.map((subId) => ({
      subId,
      networkReference: `MOCKCONV-${subId}`,
      orderValue: 49.99,
      commissionAmount: 5.0,
      status: 'pending',
      reportedAt: new Date(),
    }));
  }

  // Deterministic from the reference itself so repeat dev/manual-QA runs behave consistently
  // last hex digit even => confirmed, odd => reversed. Mock-only; never reflects real network behavior.
  async checkConversionStatuses(
    _programId: string,
    networkReferences: string[],
  ): Promise<ConversionStatusResult[]> {
    return networkReferences.map((networkReference) => ({
      networkReference,
      status: parseInt(networkReference.slice(-1), 16) % 2 === 0 ? 'confirmed' : 'reversed',
    }));
  }
}
