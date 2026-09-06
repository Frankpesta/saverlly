import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ScrapeCouponsProcessor } from '../jobs/processors/scrape-coupons.processor';
import { QUEUE_NAMES } from '../jobs/queue-names';
import { ScrapeSourcesController } from './scrape-sources.controller';
import { ScrapeSourcesService } from './scrape-sources.service';

@Module({
  imports: [
    BullModule.registerQueue({
      name: QUEUE_NAMES.SCRAPE_COUPONS,
      // Without this, a transient failure (target site timeout/5xx) gets one attempt and
      // then silently waits for its next scheduled run -- see the send-email queue in
      // notifications.module.ts for the same pattern.
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5_000 },
      },
    }),
  ],
  controllers: [ScrapeSourcesController],
  providers: [ScrapeSourcesService, ScrapeCouponsProcessor],
  exports: [ScrapeSourcesService],
})
export class ScrapeSourcesModule {}
