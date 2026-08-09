import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { AffiliateAdaptersModule } from '../affiliate-adapters/affiliate-adapters.module';
import { SyncCommissionsProcessor } from '../jobs/processors/sync-commissions.processor';
import { QUEUE_NAMES } from '../jobs/queue-names';
import { CommissionsSyncSchedulerService } from './commissions-sync-scheduler.service';
import { CommissionsController } from './commissions.controller';
import { CommissionsService } from './commissions.service';
import { MyCommissionsController } from './my-commissions.controller';

@Module({
  imports: [BullModule.registerQueue({ name: QUEUE_NAMES.SYNC_COMMISSIONS }), AffiliateAdaptersModule],
  controllers: [CommissionsController, MyCommissionsController],
  providers: [CommissionsService, SyncCommissionsProcessor, CommissionsSyncSchedulerService],
  exports: [CommissionsService],
})
export class CommissionsModule {}
