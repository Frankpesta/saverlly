import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { AffiliateAdaptersModule } from '../affiliate-adapters/affiliate-adapters.module';
import { SyncAffiliateFeedProcessor } from '../jobs/processors/sync-affiliate-feed.processor';
import { QUEUE_NAMES } from '../jobs/queue-names';
import { AffiliateSyncSchedulerService } from './affiliate-sync-scheduler.service';

@Module({
  imports: [
    BullModule.registerQueue({
      name: QUEUE_NAMES.SYNC_AFFILIATE_FEED,
      // Without this, a transient failure (affiliate network timeout/5xx) gets one attempt
      // and then silently waits for tomorrow's scheduled run -- see the send-email queue in
      // notifications.module.ts for the same pattern.
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5_000 },
      },
    }),
    AffiliateAdaptersModule,
  ],
  providers: [SyncAffiliateFeedProcessor, AffiliateSyncSchedulerService],
})
export class AffiliateSyncModule {}
