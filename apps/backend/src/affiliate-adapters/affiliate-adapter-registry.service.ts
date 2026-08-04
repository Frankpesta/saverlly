import { Injectable } from '@nestjs/common';
import { AffiliateNetworkAdapter } from './affiliate-network-adapter.interface';
import { MockAffiliateAdapter } from './mock-affiliate.adapter';

@Injectable()
export class AffiliateAdapterRegistryService {
  constructor(private readonly mockAdapter: MockAffiliateAdapter) {}

  /**
   * Only the mock/generic adapter exists so far — real per-network adapters get
   * registered here as they're built (see 02-PHASE-2-coupon-engine.md).
   */
  getAdapter(_networkName: string): AffiliateNetworkAdapter {
    return this.mockAdapter;
  }
}
