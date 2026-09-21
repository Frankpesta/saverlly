import { Injectable, ServiceUnavailableException } from '@nestjs/common';
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
   * Only the mock/generic adapter exists so far. Real per-network adapters get
   * registered here as they're built (see 02-PHASE-2-coupon-engine.md). The mock
   * adapter fabricates coupon codes, so it must only run when explicitly opted
   * into (dev/staging). Never silently for a real network in production.
   */
  getAdapter(_networkName: string): AffiliateNetworkAdapter | null {
    const mockEnabled =
      this.configService.get('AFFILIATE_MOCK_ADAPTERS_ENABLED') === 'true';
    const environment = this.configService.get('NODE_ENV');
    // Only explicitly configured mock programs can fabricate data, and never in production.
    return mockEnabled &&
      environment !== 'production' &&
      _networkName.toLowerCase() === 'mock'
      ? this.mockAdapter
      : null;
  }

  requireAdapter(networkName: string): AffiliateNetworkAdapter {
    const adapter = this.getAdapter(networkName);
    if (!adapter)
      throw new ServiceUnavailableException(
        `No live adapter is configured for ${networkName}. Network approval and integration are required before syncing.`,
      );
    return adapter;
  }
}
