import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { CouponSiteRegistry } from '../coupon-sites/coupon-site-registry';
import { CouponSiteSourcesService } from '../coupon-sites/coupon-site-sources.service';
import { ScrapeHealthService } from '../coupon-sites/scrape-health.service';
import { NotificationsModule } from '../notifications/notifications.module';
import {
  ScrapeDispatcherService,
  ScrapeDispatchSchedulerService,
} from '../coupon-sites/scrape-dispatcher.service';
import {
  COUPON_SITE_HTTP,
  defaultCouponSiteHttp,
  ScrapeRunnerService,
} from '../coupon-sites/scrape-runner.service';
import {
  ScrapeBrowserProcessor,
  ScrapeDispatchProcessor,
  ScrapeHttpProcessor,
} from '../jobs/processors/scrape-queues.processor';
import { QUEUE_NAMES } from '../jobs/queue-names';
import { ScrapeSourcesController } from './scrape-sources.controller';
import { ScrapeSourcesService } from './scrape-sources.service';

// A transient failure (site timeout/5xx, a partial read) gets two more tries with backoff before
// waiting for its next scheduled run. A block is never retried this way (UnrecoverableError).
const scrapeJobOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5_000 },
};

@Module({
  imports: [
    NotificationsModule,
    BullModule.registerQueue(
      { name: QUEUE_NAMES.SCRAPE_HTTP, defaultJobOptions: scrapeJobOptions },
      { name: QUEUE_NAMES.SCRAPE_BROWSER, defaultJobOptions: scrapeJobOptions },
      {
        name: QUEUE_NAMES.SCRAPE_DISPATCH,
        defaultJobOptions: { removeOnComplete: 100, removeOnFail: 100 },
      },
      { name: QUEUE_NAMES.SCRAPE_COUPONS },
    ),
  ],
  controllers: [ScrapeSourcesController],
  providers: [
    ScrapeSourcesService,
    CouponSiteRegistry,
    CouponSiteSourcesService,
    ScrapeHealthService,
    ScrapeRunnerService,
    ScrapeDispatcherService,
    ScrapeDispatchSchedulerService,
    { provide: COUPON_SITE_HTTP, useValue: defaultCouponSiteHttp },
    ScrapeHttpProcessor,
    ScrapeBrowserProcessor,
    ScrapeDispatchProcessor,
  ],
  exports: [ScrapeSourcesService, CouponSiteSourcesService],
})
export class ScrapeSourcesModule {}
