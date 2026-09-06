import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { AffiliateAdaptersModule } from '../affiliate-adapters/affiliate-adapters.module';
import { CommissionDigestProcessor } from '../jobs/processors/commission-digest.processor';
import { SyncCommissionsProcessor } from '../jobs/processors/sync-commissions.processor';
import { QUEUE_NAMES } from '../jobs/queue-names';
import { NotificationsModule } from '../notifications/notifications.module';
import { CommissionDigestSchedulerService } from './commission-digest-scheduler.service';
import { CommissionsSyncSchedulerService } from './commissions-sync-scheduler.service';
import { CommissionsController } from './commissions.controller';
import { CommissionsService } from './commissions.service';
import { MyCommissionsController } from './my-commissions.controller';

@Module({
  imports: [
    BullModule.registerQueue(
      {
        name: QUEUE_NAMES.SYNC_COMMISSIONS,
        // Without this, a transient failure (RDS blip, affiliate network timeout) gets one
        // attempt and then silently waits for tomorrow's scheduled run -- see the send-email
        // queue in notifications.module.ts for the same pattern.
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5_000 },
        },
      },
      {
        name: QUEUE_NAMES.COMMISSION_DIGEST,
        // sendDailyDigests() loops per kiosk with no "already sent" tracking, so a retry
        // after a partial failure could re-email the kiosks already processed before the
        // failure. Accepted tradeoff: a rare duplicate summary email is far less bad than
        // silently skipping the whole day's digest for every kiosk on one transient error.
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5_000 },
        },
      },
    ),
    AffiliateAdaptersModule,
    NotificationsModule,
  ],
  controllers: [CommissionsController, MyCommissionsController],
  providers: [
    CommissionsService,
    SyncCommissionsProcessor,
    CommissionsSyncSchedulerService,
    CommissionDigestProcessor,
    CommissionDigestSchedulerService,
  ],
  exports: [CommissionsService],
})
export class CommissionsModule {}
