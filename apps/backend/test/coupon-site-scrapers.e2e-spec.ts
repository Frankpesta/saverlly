import { getQueueToken } from '@nestjs/bullmq';
import { INestApplication } from '@nestjs/common';
import { Queue } from 'bullmq';
import { createServer, Server } from 'http';
import { AddressInfo } from 'net';
import request from 'supertest';
import { ScrapeDispatcherService } from '../src/coupon-sites/scrape-dispatcher.service';
import { COUPON_SITE_HTTP } from '../src/coupon-sites/scrape-runner.service';
import { HttpFetcher } from '../src/coupon-sites/coupon-site.types';
import { QUEUE_NAMES } from '../src/jobs/queue-names';
import { resetDatabase, resetRedisTestDb, testPrisma } from './utils/db';
import { loginAs, seedMerchant, seedUser } from './utils/fixtures';
import { createTestApp } from './utils/test-app';

async function waitFor(check: () => Promise<boolean>, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`Condition not met within ${timeoutMs}ms`);
}

// CouponFollow is answered here, never by the real site.
const couponFollowRequests: string[] = [];
const fakeCouponFollow: HttpFetcher = async (url) => {
  couponFollowRequests.push(url);
  const reply = (status: number, body: string) => ({
    url,
    status,
    headers: {},
    body,
  });
  if (url === 'https://couponfollow.com/site/shoes.test')
    return reply(
      200,
      '<article data-offer-id="C11" data-has-code="true"></article>',
    );
  if (
    url === 'https://couponfollow.com/api/v1/public/offer/modal/shoes.test/C11'
  )
    return reply(
      200,
      JSON.stringify({
        offerId: 'C11',
        code: 'Shoes15',
        description: '15% off shoes',
        discountInfo: { type: 'PercentageReduction', value: 15 },
      }),
    );
  return reply(404, 'Page not found');
};

describe('Coupon site scrapers (e2e, real BullMQ + Redis)', () => {
  let app: INestApplication;
  let adminToken: string;
  let fixtureServer: Server;
  let fixtureUrl: string;

  beforeAll(async () => {
    fixtureServer = createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(
        '<html><body><div class="coupon-code">BROWSER10</div></body></html>',
      );
    });
    await new Promise<void>((resolve) => fixtureServer.listen(0, resolve));
    fixtureUrl = `http://127.0.0.1:${(fixtureServer.address() as AddressInfo).port}/`;
  });

  afterAll(async () => {
    await new Promise((resolve) => fixtureServer.close(resolve));
    await testPrisma.$disconnect();
    await resetRedisTestDb();
  });

  beforeEach(async () => {
    couponFollowRequests.length = 0;
    await resetRedisTestDb();
    await resetDatabase();
    app = await createTestApp((builder) =>
      builder.overrideProvider(COUPON_SITE_HTTP).useValue(fakeCouponFollow),
    );
    await seedUser({ email: 'admin@test.com', role: 'ADMIN' });
    adminToken = await loginAs(app, 'admin@test.com');
  });

  afterEach(async () => {
    await app.close();
  });

  const post = (body: object) =>
    request(app.getHttpServer())
      .post('/scrape-sources')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(body);

  it("creates a coupon site source from the merchant's domain, once per site", async () => {
    const merchant = await seedMerchant({ domain: 'www.Shoes.test' });

    const created = await post({
      strategy: 'COUPONFOLLOW',
      merchantId: merchant.id,
    }).expect(201);
    expect(created.body).toMatchObject({
      strategy: 'COUPONFOLLOW',
      url: 'https://couponfollow.com/site/shoes.test',
      intervalMinutes: 360,
      status: 'ACTIVE',
      selectorConfig: null,
    });

    await post({ strategy: 'COUPONFOLLOW', merchantId: merchant.id }).expect(
      409,
    );
    // A different site for the same merchant is fine.
    const simply = await post({
      strategy: 'SIMPLYCODES',
      merchantId: merchant.id,
    }).expect(201);
    expect(simply.body).toMatchObject({
      url: 'https://simplycodes.com/store/shoes.test',
      intervalMinutes: 1440,
    });

    await post({ strategy: 'COUPONFOLLOW' }).expect(400);
    await post({
      strategy: 'COUPONFOLLOW',
      merchantId: merchant.id,
      selectorConfig: { codeSelector: '.x' },
    }).expect(400);
    // A custom source still needs its selectors.
    await post({ url: fixtureUrl, merchantId: merchant.id }).expect(400);
  });

  it('queues each due source once, on the queue its site needs, and runs both', async () => {
    const shoes = await seedMerchant({ domain: 'shoes.test' });
    const browserStore = await seedMerchant();
    const paused = await seedMerchant({ active: false });
    const past = new Date(Date.now() - 60_000);

    const httpSource = await testPrisma.scrapeSource.create({
      data: {
        strategy: 'COUPONFOLLOW',
        merchantId: shoes.id,
        url: 'https://couponfollow.com/site/shoes.test',
        intervalMinutes: 360,
        nextRunAt: past,
      },
    });
    const browserSource = await testPrisma.scrapeSource.create({
      data: {
        merchantId: browserStore.id,
        url: fixtureUrl,
        selectorConfig: { codeSelector: '.coupon-code' },
        nextRunAt: past,
      },
    });
    // Not due, or its merchant is switched off: never queued.
    const later = await testPrisma.scrapeSource.create({
      data: {
        strategy: 'COUPONFOLLOW',
        merchantId: browserStore.id,
        url: 'https://couponfollow.com/site/later.test',
        nextRunAt: new Date(Date.now() + 3_600_000),
      },
    });
    await testPrisma.scrapeSource.create({
      data: {
        strategy: 'COUPONFOLLOW',
        merchantId: paused.id,
        url: 'https://couponfollow.com/site/paused.test',
        nextRunAt: past,
      },
    });

    const dispatcher = app.get(ScrapeDispatcherService);
    // Two overlapping ticks claim each source once between them.
    const ticks = await Promise.all([
      dispatcher.dispatchDue(),
      dispatcher.dispatchDue(),
    ]);
    expect(ticks[0].queued + ticks[1].queued).toBe(2);
    expect((await dispatcher.dispatchDue()).queued).toBe(0);

    const httpQueue = app.get<Queue>(getQueueToken(QUEUE_NAMES.SCRAPE_HTTP));
    const browserQueue = app.get<Queue>(
      getQueueToken(QUEUE_NAMES.SCRAPE_BROWSER),
    );
    // BullMQ marks a job completed only after the runner's own bookkeeping, so wait on the
    // queues themselves: one job finished on each, none failed.
    await waitFor(
      async () =>
        (await httpQueue.getCompletedCount()) === 1 &&
        (await browserQueue.getCompletedCount()) === 1,
      40_000,
    );
    expect(await httpQueue.getFailedCount()).toBe(0);
    expect(await browserQueue.getFailedCount()).toBe(0);

    const shoeCoupons = await testPrisma.coupon.findMany({
      where: { merchantId: shoes.id },
    });
    expect(shoeCoupons).toEqual([
      expect.objectContaining({
        code: 'Shoes15',
        source: 'SCRAPE',
        description: '15% off shoes',
        discountType: 'PERCENT',
        discountValue: 15,
      }),
    ]);
    expect(
      await testPrisma.coupon.findMany({
        where: { merchantId: browserStore.id },
        select: { code: true },
      }),
    ).toEqual([{ code: 'BROWSER10' }]);

    const ranHttp = await testPrisma.scrapeSource.findUniqueOrThrow({
      where: { id: httpSource.id },
    });
    expect(ranHttp).toMatchObject({
      status: 'ACTIVE',
      lastCodeCount: 1,
      lastError: null,
      consecutiveFailures: 0,
    });
    expect(ranHttp.nextRunAt!.getTime()).toBeGreaterThan(
      Date.now() + 350 * 60_000,
    );
    expect(couponFollowRequests).not.toContain(later.url);
    expect(couponFollowRequests).not.toContain(
      'https://couponfollow.com/site/paused.test',
    );
  }, 60_000);

  it('marks a store CouponFollow does not list, and Run now still works for it', async () => {
    const merchant = await seedMerchant({ domain: 'unknown.test' });
    const created = await post({
      strategy: 'COUPONFOLLOW',
      merchantId: merchant.id,
    }).expect(201);
    await request(app.getHttpServer())
      .post(`/scrape-sources/${created.body.id}/run-now`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);
    await waitFor(async () => {
      const source = await testPrisma.scrapeSource.findUniqueOrThrow({
        where: { id: created.body.id },
      });
      return source.status === 'NOT_LISTED';
    }, 20_000);
    const source = await testPrisma.scrapeSource.findUniqueOrThrow({
      where: { id: created.body.id },
    });
    expect(source.lastError).toBeNull();
    expect(source.nextRunAt!.getTime()).toBeGreaterThan(
      Date.now() + 29 * 86_400_000,
    );
  }, 30_000);
});
