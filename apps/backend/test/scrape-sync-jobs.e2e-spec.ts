import { INestApplication } from '@nestjs/common';
import { createServer, Server } from 'http';
import { AddressInfo } from 'net';
import { Redis } from 'ioredis';
import { Queue } from 'bullmq';
import request from 'supertest';
import { resetDatabase, resetRedisTestDb, testPrisma } from './utils/db';
import { loginAs, seedAffiliateProgram, seedMerchant, seedUser } from './utils/fixtures';
import { createTestApp } from './utils/test-app';

async function waitFor(check: () => Promise<boolean>, timeoutMs: number, intervalMs = 300): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`Condition not met within ${timeoutMs}ms`);
}

describe('Scrape + affiliate sync jobs (e2e, real BullMQ + Redis)', () => {
  let app: INestApplication;
  let adminToken: string;
  let fixtureServer: Server;
  let fixtureUrl: string;

  beforeAll(async () => {
    await resetRedisTestDb();
    app = await createTestApp();

    fixtureServer = createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`
        <html><body>
          <div class="coupon-code">SUMMER25</div>
          <div class="coupon-code">WELCOME10</div>
        </body></html>
      `);
    });
    await new Promise<void>((resolve) => fixtureServer.listen(0, resolve));
    const { port } = fixtureServer.address() as AddressInfo;
    fixtureUrl = `http://127.0.0.1:${port}/`;
  }, 30_000);

  afterAll(async () => {
    await new Promise((resolve) => fixtureServer.close(resolve));
    await app.close();
    await testPrisma.$disconnect();
    // Flush repeatable jobs/schedules this suite created — otherwise they leak into whichever
    // spec file runs next in the shared (maxWorkers: 1) process and gets its own BullMQ workers
    // processing stale jobs against a freshly-reset test DB.
    await resetRedisTestDb();
  });

  beforeEach(async () => {
    // Flush before the DB reset so no leftover repeatable job (e.g. this file's own
    // scrape-source schedule from a prior test) fires mid-test against the new fixtures.
    await resetRedisTestDb();
    await resetDatabase();
    await seedUser({ email: 'admin@test.com', role: 'ADMIN' });
    adminToken = await loginAs(app, 'admin@test.com');
  });

  it(
    'scrapes real coupon codes via Playwright and dedupes on a repeat run',
    async () => {
      const merchant = await seedMerchant();

      const createRes = await request(app.getHttpServer())
        .post('/scrape-sources')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          url: fixtureUrl,
          merchantId: merchant.id,
          selectorConfig: { codeSelector: '.coupon-code' },
        })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/scrape-sources/${createRes.body.id}/run-now`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(201);

      // Coupon upserts happen before the processor's finally block stamps lastRunAt, so also wait
      // for lastRunAt to land — otherwise the rerun's completion check below could be satisfied by
      // this run finishing late instead of the rerun, letting the test move on while the rerun's
      // job is still in flight.
      await waitFor(async () => {
        const count = await testPrisma.coupon.count({ where: { merchantId: merchant.id } });
        if (count !== 2) return false;
        const source = await testPrisma.scrapeSource.findUniqueOrThrow({ where: { id: createRes.body.id } });
        return source.lastRunAt !== null;
      }, 20_000);

      const coupons = await testPrisma.coupon.findMany({ where: { merchantId: merchant.id } });
      expect(coupons.map((c) => c.code).sort()).toEqual(['SUMMER25', 'WELCOME10']);
      expect(coupons.every((c) => c.source === 'SCRAPE')).toBe(true);

      // The processor stamps lastRunAt in a finally block after every run (success or failure) —
      // use it as the completion signal for the rerun instead of a fixed sleep. Confirmed non-null
      // by the wait above, so this is a safe baseline for detecting the rerun's own completion.
      const beforeRerun = await testPrisma.scrapeSource.findUniqueOrThrow({
        where: { id: createRes.body.id },
      });
      const beforeRerunTime = beforeRerun.lastRunAt!.getTime();

      // Run again — dedup means the count must not grow.
      await request(app.getHttpServer())
        .post(`/scrape-sources/${createRes.body.id}/run-now`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(201);

      await waitFor(async () => {
        const source = await testPrisma.scrapeSource.findUniqueOrThrow({ where: { id: createRes.body.id } });
        return !!source.lastRunAt && source.lastRunAt.getTime() > beforeRerunTime;
      }, 20_000);

      const countAfterRerun = await testPrisma.coupon.count({ where: { merchantId: merchant.id } });
      expect(countAfterRerun).toBe(2);
    },
    30_000,
  );

  it(
    'syncs coupons from the mock affiliate adapter only for merchants with hasCouponApi: true',
    async () => {
      const programWithApi = await seedAffiliateProgram({ hasCouponApi: true });
      const programNoApi = await seedAffiliateProgram({ hasCouponApi: false });
      const merchantWithApi = await seedMerchant({ affiliateProgramId: programWithApi.id });
      const merchantNoApi = await seedMerchant({ affiliateProgramId: programNoApi.id });

      const redisUrl = new URL(process.env.REDIS_URL!);
      const connection = new Redis({
        host: redisUrl.hostname,
        port: Number(redisUrl.port || 6379),
        db: Number(redisUrl.pathname.replace(/^\//, '')),
        maxRetriesPerRequest: null,
      });
      const queue = new Queue('sync-affiliate-feed', { connection });
      try {
        await queue.add('sync-affiliate-feed', {});

        await waitFor(async () => {
          const count = await testPrisma.coupon.count({ where: { merchantId: merchantWithApi.id } });
          return count === 2;
        }, 20_000);
      } finally {
        await queue.close();
        connection.disconnect();
      }

      const withApiCoupons = await testPrisma.coupon.findMany({ where: { merchantId: merchantWithApi.id } });
      expect(withApiCoupons).toHaveLength(2);
      expect(withApiCoupons.every((c) => c.source === 'API')).toBe(true);

      const noApiCoupons = await testPrisma.coupon.findMany({ where: { merchantId: merchantNoApi.id } });
      expect(noApiCoupons).toHaveLength(0);
    },
    30_000,
  );
});
