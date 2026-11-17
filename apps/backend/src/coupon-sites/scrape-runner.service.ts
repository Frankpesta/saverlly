import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  Prisma,
  ScrapeRunOutcome,
  ScrapeSource,
  ScrapeSourceStatus,
  ScrapeStrategy,
} from '@prisma/client';
import * as Sentry from '@sentry/node';
import { UnrecoverableError } from 'bullmq';
import { fetchPublicPage } from '../common/http/fetch-public-page';
import { saveAutomatedCoupon } from '../coupons/automated-coupon.util';
import { PrismaService } from '../prisma/prisma.service';
import { BrowserSession } from './browser-session';
import { CouponSiteRegistry } from './coupon-site-registry';
import type { HttpFetcher, ScrapeOutcome } from './coupon-site.types';
import { SelectorConfig } from './generic-css.scraper';
import { ScrapeHealthService } from './scrape-health.service';

export const COUPON_SITE_HTTP = 'COUPON_SITE_HTTP';

export const defaultCouponSiteHttp: HttpFetcher = (url, headers) =>
  fetchPublicPage(url, { headers, timeoutMs: 15_000, maxBytes: 5_000_000 });

/** A store a coupon site doesn't list is checked again after this long, not every interval. */
export const NOT_LISTED_RECHECK_DAYS = 30;

/** The longest a blocked source waits between tries. */
export const MAX_BLOCK_BACKOFF_MINUTES = 7 * 1440;

/**
 * When a source runs next, given how its last run ended. A block backs off: the interval doubles
 * with each block in a row (6 h, 12 h, 24 h, 48 h for a 6-hour source), up to 7 days, so a site
 * that is turning us away hears from us less, never more.
 */
export function nextRunAfter(
  source: Pick<ScrapeSource, 'intervalMinutes'>,
  outcome: ScrapeOutcome['kind'],
  now = new Date(),
  blocksInARow = 1,
): Date {
  let minutes = source.intervalMinutes;
  if (outcome === 'not_listed') minutes = NOT_LISTED_RECHECK_DAYS * 1440;
  if (outcome === 'blocked')
    minutes = Math.min(
      source.intervalMinutes * 2 ** Math.max(blocksInARow - 1, 0),
      Math.max(source.intervalMinutes, MAX_BLOCK_BACKOFF_MINUTES),
    );
  return new Date(now.getTime() + minutes * 60_000);
}

interface JobInfo {
  id?: string;
  attemptsMade?: number;
  /** How many tries BullMQ gives the job; only the last failed one counts as a failed run. */
  attempts?: number;
  /** An admin's "Run now": runs even while the site is paused. */
  manual?: boolean;
}

/** Runs one scrape source end to end and records how it went on the source's row. */
@Injectable()
export class ScrapeRunnerService {
  private readonly logger = new Logger(ScrapeRunnerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: CouponSiteRegistry,
    @Inject(COUPON_SITE_HTTP) private readonly http: HttpFetcher,
    private readonly health: ScrapeHealthService,
  ) {}

  async run(sourceId: string, job: JobInfo = {}): Promise<void> {
    const source = await this.prisma.scrapeSource.findUnique({
      where: { id: sourceId },
    });
    if (!source || !source.active) return;

    const scraper = this.registry.forSource(source);
    const started = Date.now();
    const tag = `Scrape source=${source.id} job=${job.id ?? '-'} attempt=${(job.attemptsMade ?? 0) + 1} strategy=${scraper.key}`;
    const log = (message: string) =>
      this.logger.log(`${tag} ${message} elapsedMs=${Date.now() - started}`);
    log('phase=start');

    // A site paused after a burst of blocks: a job queued before the pause doesn't run, it moves
    // to the end of the pause. An admin's "Run now" still goes through.
    const pausedUntil = job.manual
      ? null
      : await this.health.pausedUntil(scraper.key);
    if (pausedUntil) {
      log(`phase=skipped pausedUntil=${pausedUntil.toISOString()}`);
      await this.prisma.scrapeSource.updateMany({
        where: {
          id: source.id,
          OR: [{ nextRunAt: null }, { nextRunAt: { lt: pausedUntil } }],
        },
        data: { nextRunAt: pausedUntil },
      });
      return;
    }

    const isFeed =
      source.strategy === ScrapeStrategy.GENERIC_CSS &&
      !!(source.selectorConfig as SelectorConfig | null)?.rowSelector;
    if (!source.merchantId && !isFeed) {
      // Only a multi-merchant feed resolves its merchant per row; anything else can't say which
      // merchant a code belongs to, so skip cleanly rather than guess.
      const message =
        'Source has no merchant and no multi-merchant selector configuration';
      await this.prisma.scrapeSource.updateMany({
        where: { id: source.id },
        data: { lastRunAt: new Date(), lastError: message, lastCodeCount: 0 },
      });
      throw new Error(message);
    }

    let session: BrowserSession | undefined;
    let codeCount = 0;
    let lastError: string | null = null;
    let result: ScrapeRunOutcome = ScrapeRunOutcome.FAILED;
    let outcomeData: Prisma.ScrapeSourceUpdateManyMutationInput = {};
    try {
      const outcome = await scraper.scrape({
        source,
        log,
        browser: async () => (session ??= await BrowserSession.launch()),
        fetch: this.http,
        sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      });

      if (outcome.kind === 'blocked') {
        const message = `Blocked by bot-detection (${outcome.reason}) for source ${source.id} (${source.url})`;
        Sentry.captureException(new Error(message));
        const blocks = source.consecutiveBlocks + 1;
        result = ScrapeRunOutcome.BLOCKED;
        outcomeData = {
          status: ScrapeSourceStatus.BLOCKED,
          consecutiveBlocks: blocks,
          nextRunAt: nextRunAfter(source, 'blocked', new Date(), blocks),
        };
        // Not retried within the job: asking again straight away only lengthens a block.
        throw new UnrecoverableError(message);
      }

      if (outcome.kind === 'not_listed') {
        log('phase=done notListed=true');
        result = ScrapeRunOutcome.NOT_LISTED;
        outcomeData = {
          status: ScrapeSourceStatus.NOT_LISTED,
          nextRunAt: nextRunAfter(source, 'not_listed'),
          consecutiveBlocks: 0,
        };
        return;
      }

      const failures = [...(outcome.failures ?? [])];
      const merchantByName = new Map<string, string | null>();
      let expired = 0;
      let unmatched = 0;
      for (const offer of outcome.offers) {
        if (offer.expired) {
          expired++;
          continue;
        }
        let merchantId = source.merchantId;
        if (offer.merchantName !== undefined) {
          if (!merchantByName.has(offer.merchantName)) {
            const merchant = await this.prisma.merchant.findFirst({
              where: {
                name: { equals: offer.merchantName, mode: 'insensitive' },
              },
              select: { id: true },
            });
            merchantByName.set(offer.merchantName, merchant?.id ?? null);
          }
          merchantId = merchantByName.get(offer.merchantName) ?? null;
        }
        if (!merchantId) {
          unmatched++;
          continue;
        }
        await saveAutomatedCoupon(
          this.prisma,
          merchantId,
          {
            code: offer.code,
            description: offer.description,
            discountType: offer.discountType,
            discountValue: offer.discountValue,
          },
          'SCRAPE',
          source.intervalMinutes,
          scraper.key,
        );
        codeCount++;
      }
      log(
        `phase=done saved=${codeCount} expired=${expired} unmatched=${unmatched}`,
      );
      if (!codeCount && scraper.emptyIsFailure)
        failures.push(
          'No coupon codes extracted; verify selectors or source availability',
        );
      // The store page was reached, so the site isn't blocking us, even if part of it failed.
      outcomeData = {
        status: ScrapeSourceStatus.ACTIVE,
        nextRunAt: nextRunAfter(source, 'codes'),
        consecutiveBlocks: 0,
      };
      if (failures.length) {
        // Codes found are already saved; failing the job lets BullMQ retry the rest.
        throw new Error(
          `Saved ${codeCount} code(s); ${[...new Set(failures)].join('; ')}`,
        );
      }
      result = ScrapeRunOutcome.SUCCEEDED;
    } catch (error) {
      lastError = (
        error instanceof Error ? error.message : String(error)
      ).slice(0, 2000);
      log(`phase=failed error=${lastError}`);
      throw error;
    } finally {
      await session
        ?.close()
        .catch((error) =>
          this.logger.warn(`Browser cleanup failed: ${String(error)}`),
        );
      // A failed try that BullMQ will retry isn't a failed run yet; only the last try is.
      const final =
        result !== ScrapeRunOutcome.FAILED ||
        (job.attemptsMade ?? 0) + 1 >= (job.attempts ?? 1);
      const succeeded = result === ScrapeRunOutcome.SUCCEEDED;
      await this.prisma.scrapeSource.updateMany({
        where: { id: source.id },
        data: {
          lastRunAt: new Date(),
          lastError,
          lastCodeCount: codeCount,
          // Failures in a row, blocks not counted: a block is the site's doing, not ours.
          ...(succeeded || result === ScrapeRunOutcome.NOT_LISTED
            ? { consecutiveFailures: 0 }
            : result === ScrapeRunOutcome.FAILED && final
              ? { consecutiveFailures: { increment: 1 } }
              : {}),
          ...outcomeData,
          ...(succeeded ? { lastSucceededAt: new Date() } : {}),
        },
      });
      if (final)
        await this.afterRun(source, scraper.key, result, codeCount, lastError);
    }
  }

  /** Run history, a site-wide pause after a burst of blocks, and the "site down" alert. Never
   *  allowed to hide how the run itself ended. */
  private async afterRun(
    source: ScrapeSource,
    strategy: ScrapeStrategy,
    outcome: ScrapeRunOutcome,
    codeCount: number,
    error: string | null,
  ): Promise<void> {
    try {
      await this.health.recordRun({
        sourceId: source.id,
        strategy,
        outcome,
        codeCount,
        error,
      });
      if (outcome === ScrapeRunOutcome.BLOCKED)
        await this.health.afterBlock(strategy);
      await this.health.checkSiteDown(strategy);
    } catch (err) {
      this.logger.error(`Could not record the run of source ${source.id}`, err);
    }
  }
}
