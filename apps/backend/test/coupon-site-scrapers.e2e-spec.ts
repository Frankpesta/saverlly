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
    // Each scraper records that it saw the code, and the admin list shows it.
    expect(
      await testPrisma.couponSighting.findMany({
        select: { strategy: true, coupon: { select: { code: true } } },
        orderBy: { strategy: 'asc' },
      }),
    ).toEqual([
      { strategy: 'GENERIC_CSS', coupon: { code: 'BROWSER10' } },
      { strategy: 'COUPONFOLLOW', coupon: { code: 'Shoes15' } },
    ]);
    const listed = await request(app.getHttpServer())
      .get(`/coupons?merchantId=${shoes.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(listed.body[0].sightings).toEqual([
      { strategy: 'COUPONFOLLOW', lastSeenAt: expect.any(String) },
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

  describe('automatic sources (Phase 2)', () => {
    const admin = () => ({ Authorization: `Bearer ${adminToken}` });
    const sitesOf = (merchantId: string) =>
      testPrisma.scrapeSource.findMany({
        where: { merchantId },
        orderBy: { strategy: 'asc' },
      });

    afterEach(() => {
      delete process.env.COUPON_SITES_DISABLED;
    });

    it('gives a new merchant one active source per coupon site, first run within the hour', async () => {
      const before = Date.now();
      const res = await request(app.getHttpServer())
        .post('/merchants')
        .set(admin())
        .send({
          name: 'Allbirds',
          domain: 'WWW.Allbirds.com',
          attributionMethod: 'COOKIE',
          affiliateTrackingUrl: 'https://track.allbirds.test',
        })
        .expect(201);

      const sources = await sitesOf(res.body.id);
      expect(sources).toEqual([
        expect.objectContaining({
          strategy: 'SIMPLYCODES',
          url: 'https://simplycodes.com/store/allbirds.com',
          intervalMinutes: 1440,
          active: true,
          status: 'ACTIVE',
          autoCreated: true,
          selectorConfig: null,
        }),
        expect.objectContaining({
          strategy: 'COUPONFOLLOW',
          url: 'https://couponfollow.com/site/allbirds.com',
          intervalMinutes: 360,
          active: true,
          autoCreated: true,
        }),
      ]);
      for (const source of sources) {
        expect(source.nextRunAt!.getTime()).toBeGreaterThanOrEqual(before);
        expect(source.nextRunAt!.getTime()).toBeLessThanOrEqual(
          Date.now() + 60 * 60_000,
        );
      }
    });

    it('backfills active merchants once, and never revives a source an admin switched off', async () => {
      const shop = await seedMerchant({ domain: 'shop.test' });
      const inactive = await seedMerchant({ active: false });
      // The admin already made one CouponFollow source for this shop and switched it off.
      const off = await testPrisma.scrapeSource.create({
        data: {
          strategy: 'COUPONFOLLOW',
          merchantId: shop.id,
          url: 'https://couponfollow.com/site/shop.test',
          active: false,
        },
      });

      const first = await request(app.getHttpServer())
        .post('/scrape-sources/backfill')
        .set(admin())
        .expect(201);
      expect(first.body).toEqual({ merchants: 1, created: 1 });
      const second = await request(app.getHttpServer())
        .post('/scrape-sources/backfill')
        .set(admin())
        .expect(201);
      expect(second.body).toEqual({ merchants: 1, created: 0 });

      const sources = await sitesOf(shop.id);
      expect(sources.map((s) => [s.strategy, s.active])).toEqual([
        ['SIMPLYCODES', true],
        ['COUPONFOLLOW', false],
      ]);
      expect(sources.find((s) => s.id === off.id)?.active).toBe(false);
      // A backfill's first runs are spread over a day.
      expect(sources[0].nextRunAt!.getTime()).toBeLessThanOrEqual(
        Date.now() + 24 * 3_600_000,
      );
      expect(await sitesOf(inactive.id)).toEqual([]);
    });

    it('moves coupon site pages with a domain change and leaves a hand-set URL alone', async () => {
      const res = await request(app.getHttpServer())
        .post('/merchants')
        .set(admin())
        .send({
          name: 'Mover',
          domain: 'old-shop.test',
          attributionMethod: 'COOKIE',
          affiliateTrackingUrl: 'https://track.mover.test',
        })
        .expect(201);
      // Pretend SimplyCodes said "not listed" for the old domain, and an admin pointed the
      // CouponFollow source at a page of their own.
      await testPrisma.scrapeSource.updateMany({
        where: { merchantId: res.body.id, strategy: 'SIMPLYCODES' },
        data: { status: 'NOT_LISTED' },
      });
      await testPrisma.scrapeSource.updateMany({
        where: { merchantId: res.body.id, strategy: 'COUPONFOLLOW' },
        data: { url: 'https://couponfollow.com/site/the-real-shop.test' },
      });

      await request(app.getHttpServer())
        .patch(`/merchants/${res.body.id}`)
        .set(admin())
        .send({ domain: 'new-shop.test' })
        .expect(200);

      const [simply, follow] = await sitesOf(res.body.id);
      expect(simply).toMatchObject({
        url: 'https://simplycodes.com/store/new-shop.test',
        status: 'ACTIVE',
      });
      expect(follow.url).toBe(
        'https://couponfollow.com/site/the-real-shop.test',
      );
    });

    it('deletes coupon site sources with their merchant but keeps custom ones', async () => {
      const res = await request(app.getHttpServer())
        .post('/merchants')
        .set(admin())
        .send({
          name: 'Gone',
          domain: 'gone.test',
          attributionMethod: 'COOKIE',
          affiliateTrackingUrl: 'https://track.gone.test',
        })
        .expect(201);
      const custom = await testPrisma.scrapeSource.create({
        data: {
          merchantId: res.body.id,
          url: 'https://gone.test/deals',
          selectorConfig: { codeSelector: '.code' },
        },
      });

      await request(app.getHttpServer())
        .delete(`/merchants/${res.body.id}`)
        .set(admin())
        .expect(204);

      const left = await testPrisma.scrapeSource.findMany();
      expect(left).toEqual([
        expect.objectContaining({ id: custom.id, merchantId: null }),
      ]);
    });

    it('neither creates nor runs a coupon site switched off by COUPON_SITES_DISABLED', async () => {
      process.env.COUPON_SITES_DISABLED = 'couponfollow';
      const res = await request(app.getHttpServer())
        .post('/merchants')
        .set(admin())
        .send({
          name: 'Quiet',
          domain: 'quiet.test',
          attributionMethod: 'COOKIE',
          affiliateTrackingUrl: 'https://track.quiet.test',
        })
        .expect(201);
      expect((await sitesOf(res.body.id)).map((s) => s.strategy)).toEqual([
        'SIMPLYCODES',
      ]);
      await post({ strategy: 'COUPONFOLLOW', merchantId: res.body.id }).expect(
        400,
      );

      // An existing CouponFollow source stays put but isn't queued while the site is off.
      const shoes = await seedMerchant({ domain: 'shoes.test' });
      await testPrisma.scrapeSource.create({
        data: {
          strategy: 'COUPONFOLLOW',
          merchantId: shoes.id,
          url: 'https://couponfollow.com/site/shoes.test',
          nextRunAt: new Date(Date.now() - 60_000),
        },
      });
      await testPrisma.scrapeSource.updateMany({
        where: { merchantId: res.body.id },
        data: { nextRunAt: new Date(Date.now() + 3_600_000) },
      });
      expect(
        (await app.get(ScrapeDispatcherService).dispatchDue()).queued,
      ).toBe(0);
    });
  });
});
