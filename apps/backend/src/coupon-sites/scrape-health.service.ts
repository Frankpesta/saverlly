import { Injectable, Logger } from '@nestjs/common';
import {
  NotificationType,
  ScrapeRunOutcome,
  ScrapeStrategy,
  UserRole,
} from '@prisma/client';
import {
  COUPON_SITES,
  couponSiteInfo,
  CouponSiteHealth,
} from '@saverlly/shared-types';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';

const HOUR = 60 * 60_000;

/** This many different sources blocked on one site within PAUSE_WINDOW pauses the whole site. */
export const PAUSE_AFTER_BLOCKED_SOURCES = 3;
const PAUSE_WINDOW_MS = HOUR;
export const SITE_PAUSE_MS = 6 * HOUR;

const DOWN_WINDOW_MS = 24 * HOUR;
/** Too few runs say nothing about a site; one blocked run out of one isn't "down". */
const DOWN_MIN_RUNS = 5;
const DOWN_BLOCKED_SHARE = 0.5;
const DOWN_ZERO_CODES_SHARE = 0.8;
/** Admins hear about a site at most this often. */
const DOWN_RENOTIFY_MS = 24 * HOUR;

const RUN_RETENTION_MS = 30 * 24 * HOUR;

/**
 * Keeps track of how each coupon site is behaving: one ScrapeRun row per finished run, a site-wide
 * pause after a burst of blocks, and a once-a-day "site looks down" notification for admins.
 */
@Injectable()
export class ScrapeHealthService {
  private readonly logger = new Logger(ScrapeHealthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async recordRun(run: {
    sourceId: string;
    strategy: ScrapeStrategy;
    outcome: ScrapeRunOutcome;
    codeCount?: number;
    error?: string | null;
  }): Promise<void> {
    await this.prisma.scrapeRun.create({
      data: {
        sourceId: run.sourceId,
        strategy: run.strategy,
        outcome: run.outcome,
        codeCount: run.codeCount ?? 0,
        error: run.error?.slice(0, 2000) ?? null,
      },
    });
  }

  /** When the site's pause ends, if it is paused now. Custom pages are never paused. */
  async pausedUntil(
    strategy: ScrapeStrategy,
    now = new Date(),
  ): Promise<Date | null> {
    if (strategy === ScrapeStrategy.GENERIC_CSS) return null;
    const state = await this.prisma.couponSiteState.findUnique({
      where: { strategy },
    });
    return state?.pausedUntil && state.pausedUntil > now
      ? state.pausedUntil
      : null;
  }

  async pausedStrategies(now = new Date()): Promise<ScrapeStrategy[]> {
    const states = await this.prisma.couponSiteState.findMany({
      where: { pausedUntil: { gt: now } },
      select: { strategy: true },
    });
    return states.map((s) => s.strategy);
  }

  /**
   * After a block: if enough different sources on this site were blocked in the last hour, pause
   * the whole site, so it sees nothing from us for a while instead of a stream of retries.
   */
  async afterBlock(strategy: ScrapeStrategy, now = new Date()): Promise<void> {
    if (strategy === ScrapeStrategy.GENERIC_CSS) return;
    const blocked = await this.prisma.scrapeRun.groupBy({
      by: ['sourceId'],
      where: {
        strategy,
        outcome: ScrapeRunOutcome.BLOCKED,
        finishedAt: { gte: new Date(now.getTime() - PAUSE_WINDOW_MS) },
      },
    });
    if (blocked.length < PAUSE_AFTER_BLOCKED_SOURCES) return;
    const until = new Date(now.getTime() + SITE_PAUSE_MS);
    await this.prisma.couponSiteState.upsert({
      where: { strategy },
      create: { strategy, pausedUntil: until },
      update: {},
    });
    // Only starts a pause; one already running is not stretched by later blocks.
    const started = await this.prisma.couponSiteState.updateMany({
      where: {
        strategy,
        OR: [{ pausedUntil: null }, { pausedUntil: { lte: now } }],
      },
      data: { pausedUntil: until },
    });
    if (started.count)
      this.logger.warn(
        `${strategy}: ${blocked.length} sources blocked within an hour; pausing the site until ${until.toISOString()}`,
      );
  }

  /**
   * Tells admins once a day at most when a coupon site looks down: more than half its runs in the
   * last 24 hours were blocked, or it found no codes on more than 80% of the stores it lists
   * (usually a page redesign the scraper needs updating for).
   */
  async checkSiteDown(
    strategy: ScrapeStrategy,
    now = new Date(),
  ): Promise<void> {
    const site = couponSiteInfo(strategy);
    if (!site) return;
    const since = new Date(now.getTime() - DOWN_WINDOW_MS);
    const runs = await this.prisma.scrapeRun.findMany({
      where: { strategy, finishedAt: { gte: since } },
      select: { outcome: true, codeCount: true },
    });
    const blocked = runs.filter(
      (r) => r.outcome === ScrapeRunOutcome.BLOCKED,
    ).length;
    const listed = runs.filter((r) => r.outcome === ScrapeRunOutcome.SUCCEEDED);
    const empty = listed.filter((r) => r.codeCount === 0).length;

    let reason: string | null = null;
    if (
      runs.length >= DOWN_MIN_RUNS &&
      blocked / runs.length > DOWN_BLOCKED_SHARE
    )
      reason = `${blocked} of its last ${runs.length} runs in 24 hours were blocked by its bot protection. Runs back off on their own; codes already found stay offered for 20 days.`;
    else if (
      listed.length >= DOWN_MIN_RUNS &&
      empty / listed.length > DOWN_ZERO_CODES_SHARE
    )
      reason = `It found no codes on ${empty} of ${listed.length} stores it lists in the last 24 hours. Its pages may have changed, so the scraper may need updating.`;
    if (!reason) return;

    // Claim the notification so only one run tells the admins, however many finish together.
    await this.prisma.couponSiteState.upsert({
      where: { strategy },
      create: { strategy },
      update: {},
    });
    const claimed = await this.prisma.couponSiteState.updateMany({
      where: {
        strategy,
        OR: [
          { downNotifiedAt: null },
          {
            downNotifiedAt: { lt: new Date(now.getTime() - DOWN_RENOTIFY_MS) },
          },
        ],
      },
      data: { downNotifiedAt: now },
    });
    if (!claimed.count) return;

    const admins = await this.prisma.user.findMany({
      where: { role: UserRole.ADMIN, disabled: false },
      select: { id: true },
    });
    for (const admin of admins)
      await this.notifications.notify({
        userId: admin.id,
        type: NotificationType.COUPON_SITE_DOWN,
        title: `${site.label} looks down`,
        body: reason,
        metadata: { strategy },
      });
  }

  /** The dashboard's coupon sites panel: each built-in site, then custom pages. */
  async siteHealth(now = new Date()): Promise<CouponSiteHealth[]> {
    const since = new Date(now.getTime() - DOWN_WINDOW_MS);
    const strategies: ScrapeStrategy[] = [
      ...COUPON_SITES.map((site) => site.strategy as ScrapeStrategy),
      ScrapeStrategy.GENERIC_CSS,
    ];
    const [counts, lastWins, states] = await Promise.all([
      this.prisma.scrapeRun.groupBy({
        by: ['strategy', 'outcome'],
        where: { finishedAt: { gte: since } },
        _count: { _all: true },
        _sum: { codeCount: true },
      }),
      this.prisma.scrapeRun.groupBy({
        by: ['strategy'],
        where: { outcome: ScrapeRunOutcome.SUCCEEDED },
        _max: { finishedAt: true },
      }),
      this.prisma.couponSiteState.findMany({
        where: { pausedUntil: { gt: now } },
      }),
    ]);
    return strategies.map((strategy) => {
      const of = (outcome: ScrapeRunOutcome) =>
        counts.find((c) => c.strategy === strategy && c.outcome === outcome);
      const paused = states.find((s) => s.strategy === strategy);
      const lastWin = lastWins.find((w) => w.strategy === strategy)?._max
        .finishedAt;
      return {
        strategy,
        label: couponSiteInfo(strategy)?.label ?? 'Custom pages',
        runs: {
          succeeded: of(ScrapeRunOutcome.SUCCEEDED)?._count._all ?? 0,
          blocked: of(ScrapeRunOutcome.BLOCKED)?._count._all ?? 0,
          notListed: of(ScrapeRunOutcome.NOT_LISTED)?._count._all ?? 0,
          failed: of(ScrapeRunOutcome.FAILED)?._count._all ?? 0,
        },
        // Codes saved by finished runs, partial ones included.
        codesFound: counts
          .filter((c) => c.strategy === strategy)
          .reduce((sum, c) => sum + (c._sum.codeCount ?? 0), 0),
        lastSucceededAt: lastWin ? lastWin.toISOString() : null,
        pausedUntil: paused?.pausedUntil?.toISOString() ?? null,
      };
    });
  }

  /** Drops run history older than 30 days. Called from the dispatcher tick. */
  async prune(now = new Date()): Promise<void> {
    await this.prisma.scrapeRun.deleteMany({
      where: { finishedAt: { lt: new Date(now.getTime() - RUN_RETENTION_MS) } },
    });
  }
}
