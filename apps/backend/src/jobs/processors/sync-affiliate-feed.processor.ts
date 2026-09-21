import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { saveAutomatedCoupon } from '../../coupons/automated-coupon.util';
import { Job } from 'bullmq';
import { AffiliateAdapterRegistryService } from '../../affiliate-adapters/affiliate-adapter-registry.service';
import { PrismaService } from '../../prisma/prisma.service';
import { QUEUE_NAMES } from '../queue-names';

@Processor(QUEUE_NAMES.SYNC_AFFILIATE_FEED)
export class SyncAffiliateFeedProcessor extends WorkerHost {
  private readonly logger = new Logger(SyncAffiliateFeedProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly adapterRegistry: AffiliateAdapterRegistryService,
  ) {
    super();
  }

  async process(_job: Job): Promise<void> {
    // Iterates all merchants each run rather than one job-per-merchant. There's no per-merchant
    // schedule configuration in the spec for this feed (unlike scrape sources), so a single
    // repeatable job sweeping every eligible merchant is simplest. Merchants whose program has
    // hasCouponApi: false are skipped silently. Not an error state.
    const merchants = await this.prisma.merchant.findMany({
      where: { affiliateProgram: { hasCouponApi: true } },
      include: { affiliateProgram: true },
    });

    for (const merchant of merchants) {
      if (!merchant.affiliateProgram) {
        continue;
      }
      const adapter = this.adapterRegistry.requireAdapter(
        merchant.affiliateProgram.networkName,
      );
      const coupons = await adapter.fetchCoupons(merchant.affiliateProgram.id);

      for (const coupon of coupons) {
        await saveAutomatedCoupon(this.prisma, merchant.id, coupon, 'API');
      }

      this.logger.log(
        `Synced ${coupons.length} coupon(s) for merchant ${merchant.id}`,
      );
    }
  }
}
