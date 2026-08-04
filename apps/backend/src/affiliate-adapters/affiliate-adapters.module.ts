import { Module } from '@nestjs/common';
import { AffiliateAdapterRegistryService } from './affiliate-adapter-registry.service';
import { MockAffiliateAdapter } from './mock-affiliate.adapter';

@Module({
  providers: [MockAffiliateAdapter, AffiliateAdapterRegistryService],
  exports: [AffiliateAdapterRegistryService],
})
export class AffiliateAdaptersModule {}
