import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { CouponSource } from '@prisma/client';
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
    // Iterates all merchants each run rather than one job-per-merchant — there's no per-merchant
    // schedule configuration in the spec for this feed (unlike scrape sources), so a single
    // repeatable job sweeping every eligible merchant is simplest. Merchants whose program has
    // hasCouponApi: false are skipped silently — not an error state.
    const merchants = await this.prisma.merchant.findMany({
      where: { affiliateProgram: { hasCouponApi: true } },
      include: { affiliateProgram: true },
    });

    for (const merchant of merchants) {
      if (!merchant.affiliateProgram) {
        continue;
      }
      const adapter = this.adapterRegistry.getAdapter(merchant.affiliateProgram.networkName);
      const coupons = await adapter.fetchCoupons(merchant.affiliateProgram.id);

      for (const coupon of coupons) {
        await this.prisma.coupon.upsert({
          where: { merchantId_code: { merchantId: merchant.id, code: coupon.code } },
          update: {
            source: CouponSource.API,
            description: coupon.description,
            discountType: coupon.discountType,
            discountValue: coupon.discountValue,
            expiresAt: coupon.expiresAt,
            active: true,
          },
          create: {
            merchantId: merchant.id,
            code: coupon.code,
            source: CouponSource.API,
            description: coupon.description,
            discountType: coupon.discountType,
            discountValue: coupon.discountValue,
            expiresAt: coupon.expiresAt,
          },
        });
      }

      this.logger.log(`Synced ${coupons.length} coupon(s) for merchant ${merchant.id}`);
    }
  }
}
