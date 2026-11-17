import { UnrecoverableError } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { CouponSiteRegistry } from './coupon-site-registry';
import { HttpFetcher } from './coupon-site.types';
import { fakeHealth } from './fake-health.testing';
import { ScrapeHealthService } from './scrape-health.service';
import { couponFollowScraper } from './couponfollow.scraper';
import { genericCssScraper } from './generic-css.scraper';
import {
  nextRunAfter,
  NOT_LISTED_RECHECK_DAYS,
  ScrapeRunnerService,
} from './scrape-runner.service';
import { simplyCodesScraper } from './simplycodes.scraper';

const STORE = 'https://couponfollow.com/site/allbirds.com';
const API = 'https://couponfollow.com/api/v1/public/offer/modal/allbirds.com';
const LISTING =
  '<article data-offer-id="C1" data-has-code="true"></article><article data-offer-id="C2" data-has-code="true"></article>';

function setup(
  responses: Record<string, { status: number; body: string }>,
  existing: Record<string, unknown> | null = null,
  sourceOverrides: Record<string, unknown> = {},
  job: Parameters<ScrapeRunnerService['run']>[1] = {},
) {
  const health = fakeHealth();
  const prisma = {
    scrapeSource: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'source',
        strategy: 'COUPONFOLLOW',
        active: true,
        merchantId: 'merchant',
        intervalMinutes: 360,
        url: STORE,
        selectorConfig: null,
        consecutiveBlocks: 0,
        ...sourceOverrides,
      }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    coupon: {
      findUnique: jest.fn().mockResolvedValue(existing),
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
    },
    couponSighting: { upsert: jest.fn().mockResolvedValue({}) },
    $transaction: jest.fn().mockImplementation(async (work) => work(prisma)),
  };
  const http: HttpFetcher = async (url) => {
    const response = responses[url];
    if (!response) throw new Error(`unexpected request ${url}`);
    return { url, headers: {}, ...response };
  };
  const runner = new ScrapeRunnerService(
    prisma as unknown as PrismaService,
    new CouponSiteRegistry(),
    http,
    health as unknown as ScrapeHealthService,
  );
  // CouponFollow waits a second between offers; not in a unit test.
  jest.spyOn(global, 'setTimeout').mockImplementation(((fn: () => void) => {
    fn();
    return 0;
  }) as unknown as typeof setTimeout);
  const lastUpdate = () =>
    prisma.scrapeSource.updateMany.mock.calls.at(-1)![0].data;
  return { prisma, health, run: () => runner.run('source', job), lastUpdate };
}

const offer = (id: string, extra: Record<string, unknown> = {}) => ({
  status: 200,
  body: JSON.stringify({
    offerId: id,
    code: `CODE${id}`,
    description: `Offer ${id}`,
    discountInfo: { type: 'PercentageReduction', value: 10 },
    ...extra,
  }),
});

afterEach(() => jest.restoreAllMocks());

describe('ScrapeRunnerService', () => {
  it('saves live codes with their details, skips expired ones, and schedules the next run', async () => {
    const { prisma, run, lastUpdate } = setup({
      [STORE]: { status: 200, body: LISTING },
      [`${API}/C1`]: offer('C1'),
      [`${API}/C2`]: offer('C2', { isExpired: true }),
    });
    const before = Date.now();
    await run();
    expect(prisma.coupon.create).toHaveBeenCalledTimes(1);
    // The code is recorded as seen by CouponFollow, for ranking.
    expect(prisma.couponSighting.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.couponSighting.upsert.mock.calls[0][0]).toMatchObject({
      create: { strategy: 'COUPONFOLLOW' },
      update: { lastSeenAt: expect.any(Date) },
    });
    expect(prisma.coupon.create.mock.calls[0][0].data).toMatchObject({
      merchantId: 'merchant',
      code: 'CODEC1',
      source: 'SCRAPE',
      description: 'Offer C1',
      discountType: 'PERCENT',
      discountValue: 10,
    });
    const data = lastUpdate();
    expect(data).toMatchObject({
      status: 'ACTIVE',
      lastError: null,
      lastCodeCount: 1,
      consecutiveFailures: 0,
      lastSucceededAt: expect.any(Date),
    });
    expect(data.nextRunAt.getTime()).toBeGreaterThanOrEqual(
      before + 360 * 60_000,
    );
  });

  it('never replaces details a coupon already has', async () => {
    const { prisma, run } = setup(
      {
        [STORE]: { status: 200, body: LISTING.split('</article>')[0] },
        [`${API}/C1`]: offer('C1'),
      },
      {
        id: 'coupon',
        source: 'SCRAPE',
        description: 'Written by an admin',
        discountType: null,
        discountValue: null,
      },
    );
    await run();
    const data = prisma.coupon.update.mock.calls[0][0].data;
    expect(data.description).toBeUndefined();
    expect(data).toMatchObject({ discountType: 'PERCENT', discountValue: 10 });
  });

  it('marks a store the site does not list and rechecks it in 30 days', async () => {
    const { run, lastUpdate } = setup({
      [STORE]: { status: 404, body: 'Page not found' },
    });
    await run();
    const data = lastUpdate();
    expect(data).toMatchObject({
      status: 'NOT_LISTED',
      lastError: null,
      consecutiveFailures: 0,
    });
    expect(data.lastSucceededAt).toBeUndefined();
    expect(data.nextRunAt.getTime() - Date.now()).toBeGreaterThan(
      (NOT_LISTED_RECHECK_DAYS - 1) * 86_400_000,
    );
  });

  const BLOCK_PAGE = {
    [STORE]: { status: 403, body: '<title>Just a moment...</title>' },
  };

  it('records a block without retrying it, and backs off more with each block in a row', async () => {
    const { prisma, health, run, lastUpdate } = setup(BLOCK_PAGE, null, {
      consecutiveBlocks: 2,
    });
    const before = Date.now();
    const error = await run().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UnrecoverableError);
    expect(prisma.coupon.create).not.toHaveBeenCalled();
    const data = lastUpdate();
    expect(data).toMatchObject({
      status: 'BLOCKED',
      lastError: expect.stringContaining('Blocked by bot-detection'),
      consecutiveBlocks: 3,
    });
    // A block is the site's doing, not a failure of ours.
    expect(data.consecutiveFailures).toBeUndefined();
    // Third block in a row on a 6-hour source: 6 h x 4 = 24 h.
    expect(data.nextRunAt.getTime() - before).toBeGreaterThanOrEqual(
      24 * 3_600_000 - 1_000,
    );
    expect(data.nextRunAt.getTime() - before).toBeLessThan(
      24 * 3_600_000 + 60_000,
    );
    expect(health.recordRun).toHaveBeenCalledWith(
      expect.objectContaining({ strategy: 'COUPONFOLLOW', outcome: 'BLOCKED' }),
    );
    expect(health.afterBlock).toHaveBeenCalledWith('COUPONFOLLOW');
    expect(health.checkSiteDown).toHaveBeenCalledWith('COUPONFOLLOW');
  });

  it('resets the block count once the site lets us in again', async () => {
    const { run, lastUpdate } = setup(
      {
        [STORE]: { status: 200, body: LISTING.split('</article>')[0] },
        [`${API}/C1`]: offer('C1'),
      },
      null,
      { consecutiveBlocks: 4, status: 'BLOCKED' },
    );
    await run();
    expect(lastUpdate()).toMatchObject({
      status: 'ACTIVE',
      consecutiveBlocks: 0,
      consecutiveFailures: 0,
    });
  });

  it('counts a failure only on the last try BullMQ gives the job', async () => {
    const retried = setup({}, null, {}, { attemptsMade: 0, attempts: 3 });
    await expect(retried.run()).rejects.toThrow('unexpected request');
    const data = retried.lastUpdate();
    expect(data.status).toBeUndefined();
    expect(data.nextRunAt).toBeUndefined();
    expect(data.consecutiveFailures).toBeUndefined();
    expect(retried.health.recordRun).not.toHaveBeenCalled();

    const last = setup({}, null, {}, { attemptsMade: 2, attempts: 3 });
    await expect(last.run()).rejects.toThrow('unexpected request');
    expect(last.lastUpdate().consecutiveFailures).toEqual({ increment: 1 });
    expect(last.health.recordRun).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: 'FAILED',
        error: expect.stringContaining('unexpected request'),
      }),
    );
  });

  it('moves a queued run to the end of a site-wide pause, unless an admin asked for it', async () => {
    const until = new Date(Date.now() + 3 * 3_600_000);
    const queued = setup(BLOCK_PAGE);
    queued.health.pausedUntil.mockResolvedValue(until);
    await queued.run();
    expect(queued.prisma.scrapeSource.updateMany).toHaveBeenCalledTimes(1);
    expect(queued.lastUpdate()).toEqual({ nextRunAt: until });
    expect(queued.health.recordRun).not.toHaveBeenCalled();

    const manual = setup(BLOCK_PAGE, null, {}, { manual: true });
    manual.health.pausedUntil.mockResolvedValue(until);
    await expect(manual.run()).rejects.toBeInstanceOf(UnrecoverableError);
    expect(manual.health.pausedUntil).not.toHaveBeenCalled();
  });

  it('still finishes the run when recording its history fails', async () => {
    const { health, run, lastUpdate } = setup({
      [STORE]: { status: 404, body: 'Page not found' },
    });
    health.recordRun.mockRejectedValue(new Error('db down'));
    await run();
    expect(lastUpdate()).toMatchObject({ status: 'NOT_LISTED' });
  });
});

describe('nextRunAfter', () => {
  const now = new Date('2026-11-17T00:00:00Z');
  it('waits the interval after a run, and 30 days after "not listed"', () => {
    expect(nextRunAfter({ intervalMinutes: 360 }, 'codes', now)).toEqual(
      new Date('2026-11-17T06:00:00Z'),
    );
    expect(nextRunAfter({ intervalMinutes: 360 }, 'not_listed', now)).toEqual(
      new Date('2026-12-17T00:00:00Z'),
    );
  });

  it('doubles the wait with each block in a row, up to 7 days', () => {
    const hours = (source: { intervalMinutes: number }, blocks: number) =>
      (nextRunAfter(source, 'blocked', now, blocks).getTime() - now.getTime()) /
      3_600_000;
    const sixHourly = { intervalMinutes: 360 };
    expect([1, 2, 3, 4, 5].map((n) => hours(sixHourly, n))).toEqual([
      6, 12, 24, 48, 96,
    ]);
    expect(hours(sixHourly, 10)).toBe(7 * 24);
    expect(hours({ intervalMinutes: 1440 }, 2)).toBe(48);
    // A source that already runs less often than weekly keeps its own interval.
    expect(hours({ intervalMinutes: 14 * 1440 }, 3)).toBe(14 * 24);
  });
});

describe('CouponSiteRegistry', () => {
  const registry = new CouponSiteRegistry();
  it('picks the scraper by strategy', () => {
    const base = { url: 'https://example.com/', selectorConfig: null };
    expect(registry.forSource({ ...base, strategy: 'COUPONFOLLOW' })).toBe(
      couponFollowScraper,
    );
    expect(registry.forSource({ ...base, strategy: 'SIMPLYCODES' })).toBe(
      simplyCodesScraper,
    );
    expect(
      registry.forSource({
        ...base,
        strategy: 'GENERIC_CSS',
        selectorConfig: { codeSelector: '.c' },
      }),
    ).toBe(genericCssScraper);
  });

  it('keeps a hand-made SimplyCodes source on the SimplyCodes collector', () => {
    expect(
      registry.forSource({
        strategy: 'GENERIC_CSS',
        url: 'https://simplycodes.com/store/allbirds.com',
        selectorConfig: { codeSelector: '#c', revealSelector: '.r' },
      }),
    ).toBe(simplyCodesScraper);
  });
});
