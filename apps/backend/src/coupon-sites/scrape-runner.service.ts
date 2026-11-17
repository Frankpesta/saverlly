import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  Prisma,
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

export const COUPON_SITE_HTTP = 'COUPON_SITE_HTTP';

export const defaultCouponSiteHttp: HttpFetcher = (url, headers) =>
  fetchPublicPage(url, { headers, timeoutMs: 15_000, maxBytes: 5_000_000 });

/** A store a coupon site doesn't list is checked again after this long, not every interval. */
export const NOT_LISTED_RECHECK_DAYS = 30;

/** When a source runs next, given how its last run ended. Phase 4 adds back-off for blocks. */
export function nextRunAfter(
  source: Pick<ScrapeSource, 'intervalMinutes'>,
  outcome: ScrapeOutcome['kind'],
  now = new Date(),
): Date {
  const minutes =
    outcome === 'not_listed'
      ? NOT_LISTED_RECHECK_DAYS * 1440
      : source.intervalMinutes;
  return new Date(now.getTime() + minutes * 60_000);
}

interface JobInfo {
  id?: string;
  attemptsMade?: number;
}

/** Runs one scrape source end to end and records how it went on the source's row. */
@Injectable()
export class ScrapeRunnerService {
  private readonly logger = new Logger(ScrapeRunnerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: CouponSiteRegistry,
    @Inject(COUPON_SITE_HTTP) private readonly http: HttpFetcher,
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
    let succeeded = false;
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
        outcomeData = {
          status: ScrapeSourceStatus.BLOCKED,
          nextRunAt: nextRunAfter(source, 'blocked'),
        };
        // Not retried within the job: asking again straight away only lengthens a block.
        throw new UnrecoverableError(message);
      }

      if (outcome.kind === 'not_listed') {
        log('phase=done notListed=true');
        outcomeData = {
          status: ScrapeSourceStatus.NOT_LISTED,
          nextRunAt: nextRunAfter(source, 'not_listed'),
          consecutiveFailures: 0,
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
      };
      if (failures.length) {
        // Codes found are already saved; failing the job lets BullMQ retry the rest.
        throw new Error(
          `Saved ${codeCount} code(s); ${[...new Set(failures)].join('; ')}`,
        );
      }
      succeeded = true;
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
      await this.prisma.scrapeSource.updateMany({
        where: { id: source.id },
        data: {
          lastRunAt: new Date(),
          lastError,
          lastCodeCount: codeCount,
          consecutiveFailures:
            succeeded || outcomeData.status === ScrapeSourceStatus.NOT_LISTED
              ? 0
              : { increment: 1 },
          ...outcomeData,
          ...(succeeded ? { lastSucceededAt: new Date() } : {}),
        },
      });
    }
  }
}
