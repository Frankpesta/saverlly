import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ScrapeCouponsProcessor } from '../jobs/processors/scrape-coupons.processor';
import { QUEUE_NAMES } from '../jobs/queue-names';
import { ScrapeSourcesController } from './scrape-sources.controller';
import { ScrapeSourcesService } from './scrape-sources.service';

@Module({
  imports: [BullModule.registerQueue({ name: QUEUE_NAMES.SCRAPE_COUPONS })],
  controllers: [ScrapeSourcesController],
  providers: [ScrapeSourcesService, ScrapeCouponsProcessor],
  exports: [ScrapeSourcesService],
})
export class ScrapeSourcesModule {}
