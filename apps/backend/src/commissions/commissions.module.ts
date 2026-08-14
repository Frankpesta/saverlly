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
      { name: QUEUE_NAMES.SYNC_COMMISSIONS },
      { name: QUEUE_NAMES.COMMISSION_DIGEST },
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
