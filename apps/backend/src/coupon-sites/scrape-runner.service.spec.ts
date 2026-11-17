import { UnrecoverableError } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { CouponSiteRegistry } from './coupon-site-registry';
import { HttpFetcher } from './coupon-site.types';
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
) {
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
      }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    coupon: {
      findUnique: jest.fn().mockResolvedValue(existing),
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
    },
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
  );
  // CouponFollow waits a second between offers; not in a unit test.
  jest.spyOn(global, 'setTimeout').mockImplementation(((fn: () => void) => {
    fn();
    return 0;
  }) as unknown as typeof setTimeout);
  const lastUpdate = () =>
    prisma.scrapeSource.updateMany.mock.calls.at(-1)![0].data;
  return { prisma, run: () => runner.run('source'), lastUpdate };
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

  it('records a block without retrying it inside the job', async () => {
    const { prisma, run, lastUpdate } = setup({
      [STORE]: { status: 403, body: '<title>Just a moment...</title>' },
    });
    const error = await run().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UnrecoverableError);
    expect(prisma.coupon.create).not.toHaveBeenCalled();
    expect(lastUpdate()).toMatchObject({
      status: 'BLOCKED',
      lastError: expect.stringContaining('Blocked by bot-detection'),
      consecutiveFailures: { increment: 1 },
    });
  });

  it('counts a thrown error as a failure without touching status or next run', async () => {
    const { run, lastUpdate } = setup({});
    await expect(run()).rejects.toThrow('unexpected request');
    const data = lastUpdate();
    expect(data.status).toBeUndefined();
    expect(data.nextRunAt).toBeUndefined();
    expect(data.consecutiveFailures).toEqual({ increment: 1 });
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
