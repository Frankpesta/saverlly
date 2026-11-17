import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ScrapeSource } from '@prisma/client';
import { Queue } from 'bullmq';
import { QUEUE_NAMES } from '../jobs/queue-names';
import { PrismaService } from '../prisma/prisma.service';
import { CouponSiteRegistry } from './coupon-site-registry';

export const SCRAPE_JOB_NAME = 'scrape-coupons';
const DISPATCH_JOB_NAME = 'dispatch-due-sources';
const DISPATCH_SCHEDULER_ID = 'scrape-dispatch';
export const DISPATCH_EVERY_MS = 5 * 60_000;
/** At most this many sources are queued per tick; the rest wait for the next one. */
const DISPATCH_BATCH = 500;

export interface ScrapeJobData {
  scrapeSourceId: string;
}

/**
 * Queues scrape sources whose nextRunAt has come, onto the HTTP or browser queue their scraper
 * needs. Sources are scheduled from the database, so a Redis reset loses nothing, and how a run
 * ends (Phase 4 back-off, 30-day recheck) decides the next one instead of a fixed repeat.
 */
@Injectable()
export class ScrapeDispatcherService {
  private readonly logger = new Logger(ScrapeDispatcherService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: CouponSiteRegistry,
    @InjectQueue(QUEUE_NAMES.SCRAPE_HTTP) private readonly httpQueue: Queue,
    @InjectQueue(QUEUE_NAMES.SCRAPE_BROWSER)
    private readonly browserQueue: Queue,
  ) {}

  async dispatchDue(now = new Date()): Promise<{ queued: number }> {
    const due = await this.prisma.scrapeSource.findMany({
      where: {
        active: true,
        OR: [{ nextRunAt: null }, { nextRunAt: { lte: now } }],
        AND: [{ OR: [{ merchantId: null }, { merchant: { active: true } }] }],
      },
      orderBy: { nextRunAt: { sort: 'asc', nulls: 'first' } },
      take: DISPATCH_BATCH,
    });
    const perSite = new Map<string, number>();
    let queued = 0;
    for (const source of due) {
      // Claim the source by moving its nextRunAt on, only if no other tick already did: a slow
      // tick overlapping the next one can't queue the same source twice. The run itself sets
      // the real next run when it ends.
      const claimed = await this.prisma.scrapeSource.updateMany({
        where: { id: source.id, nextRunAt: source.nextRunAt },
        data: {
          nextRunAt: new Date(now.getTime() + source.intervalMinutes * 60_000),
        },
      });
      if (!claimed.count) continue;
      const scraper = this.registry.forSource(source);
      const index = perSite.get(scraper.key) ?? 0;
      perSite.set(scraper.key, index + 1);
      await this.enqueue(source, {
        jobId: `src_${source.id}_${source.nextRunAt?.getTime() ?? 0}`,
        delay: index * scraper.spacingMs,
      });
      queued++;
    }
    if (queued) this.logger.log(`Queued ${queued} scrape source(s)`);
    return { queued };
  }

  /** The dashboard's "Run now": straight onto the right queue, outside the schedule. */
  async runNow(source: ScrapeSource): Promise<void> {
    await this.enqueue(source, { jobId: `src_${source.id}_now_${Date.now()}` });
  }

  private enqueue(
    source: Pick<ScrapeSource, 'id' | 'strategy' | 'url' | 'selectorConfig'>,
    options: { jobId: string; delay?: number },
  ) {
    const queue =
      this.registry.forSource(source).fetchMode === 'http'
        ? this.httpQueue
        : this.browserQueue;
    const data: ScrapeJobData = { scrapeSourceId: source.id };
    return queue.add(SCRAPE_JOB_NAME, data, {
      ...options,
      removeOnComplete: 1000,
      removeOnFail: 5000,
    });
  }
}

/** Starts the 5-minute dispatcher tick and clears the retired per-source repeat jobs. */
@Injectable()
export class ScrapeDispatchSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(ScrapeDispatchSchedulerService.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.SCRAPE_DISPATCH)
    private readonly dispatchQueue: Queue,
    @InjectQueue(QUEUE_NAMES.SCRAPE_COUPONS)
    private readonly retiredQueue: Queue,
  ) {}

  async onModuleInit() {
    try {
      await this.dispatchQueue.upsertJobScheduler(
        DISPATCH_SCHEDULER_ID,
        { every: DISPATCH_EVERY_MS },
        { name: DISPATCH_JOB_NAME },
      );
      // Nothing processes the old queue any more; its repeat jobs would only pile up.
      await this.retiredQueue.obliterate({ force: true });
    } catch (err) {
      this.logger.error(
        'Failed to start the scrape dispatcher. Sources will not run on schedule',
        err,
      );
    }
  }
}
