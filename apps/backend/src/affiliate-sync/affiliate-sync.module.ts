import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { AffiliateAdaptersModule } from '../affiliate-adapters/affiliate-adapters.module';
import { SyncAffiliateFeedProcessor } from '../jobs/processors/sync-affiliate-feed.processor';
import { QUEUE_NAMES } from '../jobs/queue-names';
import { AffiliateSyncSchedulerService } from './affiliate-sync-scheduler.service';

@Module({
  imports: [
    BullModule.registerQueue({ name: QUEUE_NAMES.SYNC_AFFILIATE_FEED }),
    AffiliateAdaptersModule,
  ],
  providers: [SyncAffiliateFeedProcessor, AffiliateSyncSchedulerService],
})
export class AffiliateSyncModule {}
