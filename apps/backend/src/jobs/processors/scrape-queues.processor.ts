import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import {
  ScrapeDispatcherService,
  ScrapeJobData,
} from '../../coupon-sites/scrape-dispatcher.service';
import { ScrapeRunnerService } from '../../coupon-sites/scrape-runner.service';
import { QUEUE_NAMES } from '../queue-names';

/** Sources read over plain HTTP: cheap, so a few run side by side. */
@Processor(QUEUE_NAMES.SCRAPE_HTTP, { concurrency: 4 })
export class ScrapeHttpProcessor extends WorkerHost {
  constructor(private readonly runner: ScrapeRunnerService) {
    super();
  }

  process(job: Job<ScrapeJobData>): Promise<void> {
    return this.runner.run(job.data.scrapeSourceId, job);
  }
}

/** Sources that need Chromium: one at a time, as before. */
@Processor(QUEUE_NAMES.SCRAPE_BROWSER, { concurrency: 1 })
export class ScrapeBrowserProcessor extends WorkerHost {
  constructor(private readonly runner: ScrapeRunnerService) {
    super();
  }

  process(job: Job<ScrapeJobData>): Promise<void> {
    return this.runner.run(job.data.scrapeSourceId, job);
  }
}

@Processor(QUEUE_NAMES.SCRAPE_DISPATCH)
export class ScrapeDispatchProcessor extends WorkerHost {
  constructor(private readonly dispatcher: ScrapeDispatcherService) {
    super();
  }

  async process(): Promise<void> {
    await this.dispatcher.dispatchDue();
  }
}
