import { Injectable } from '@nestjs/common';
import { AffiliateCouponDto, AffiliateNetworkAdapter } from './affiliate-network-adapter.interface';

/**
 * Generic/mock adapter for development — used for every network until a real,
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
}
