import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AffiliateNetworkAdapter } from './affiliate-network-adapter.interface';
import { MockAffiliateAdapter } from './mock-affiliate.adapter';

@Injectable()
export class AffiliateAdapterRegistryService {
  constructor(
    private readonly mockAdapter: MockAffiliateAdapter,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Only the mock/generic adapter exists so far — real per-network adapters get
   * registered here as they're built (see 02-PHASE-2-coupon-engine.md). The mock
   * adapter fabricates coupon codes, so it must only run when explicitly opted
   * into (dev/staging) — never silently for a real network in production.
   */
  getAdapter(_networkName: string): AffiliateNetworkAdapter | null {
    const mockEnabled = this.configService.get('AFFILIATE_MOCK_ADAPTERS_ENABLED') === 'true';
    return mockEnabled ? this.mockAdapter : null;
  }
}
