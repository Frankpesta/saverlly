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
  });

  beforeEach(async () => {
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

      await waitFor(async () => {
        const count = await testPrisma.coupon.count({ where: { merchantId: merchant.id } });
        return count === 2;
      }, 20_000);

      const coupons = await testPrisma.coupon.findMany({ where: { merchantId: merchant.id } });
      expect(coupons.map((c) => c.code).sort()).toEqual(['SUMMER25', 'WELCOME10']);
      expect(coupons.every((c) => c.source === 'SCRAPE')).toBe(true);

      // Run again — dedup means the count must not grow.
      await request(app.getHttpServer())
        .post(`/scrape-sources/${createRes.body.id}/run-now`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(201);

      await new Promise((resolve) => setTimeout(resolve, 3000));
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
