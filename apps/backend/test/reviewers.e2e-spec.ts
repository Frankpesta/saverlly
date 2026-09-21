import { INestApplication } from '@nestjs/common';
import { randomBytes, randomUUID } from 'crypto';
import request from 'supertest';
import { ReviewersService } from '../src/reviewers/reviewers.service';
import { resetDatabase, resetRedisTestDb, testPrisma } from './utils/db';
import {
  seedUser,
  seedKiosk,
  seedLocation,
  seedDeviceWithToken,
  seedMerchant,
  seedCoupon,
  loginAs,
} from './utils/fixtures';
import { createTestApp } from './utils/test-app';

describe('Temporary reviewer access', () => {
  let app: INestApplication;
  let admin: string;
  const newToken = () => randomBytes(32).toString('base64url');
  const payload = () => ({
    name: 'Network reviewer',
    email: 'reviewer@example.com',
    expiresAt: new Date(Date.now() + 86400_000).toISOString(),
    maxInstallations: 1,
  });
  const authorized = () => ({ Authorization: `Bearer ${admin}` });
  async function invite() {
    await request(app.getHttpServer())
      .patch('/reviewers/access')
      .set(authorized())
      .send({ enabled: true })
      .expect(200);
    return (
      await request(app.getHttpServer())
        .post('/reviewers')
        .set(authorized())
        .send(payload())
        .expect(201)
    ).body;
  }
  async function activate(code: string, token = newToken()) {
    await request(app.getHttpServer())
      .post('/reviewer-access/redeem')
      .send({ code, token })
      .expect(201);
    return token;
  }
  const status = (token: string) =>
    request(app.getHttpServer())
      .get('/reviewer-public/devices/me/status')
      .set('Authorization', `Bearer ${token}`);
  beforeAll(async () => {
    await resetRedisTestDb();
  });
  beforeEach(async () => {
    await resetDatabase();
    app = await createTestApp();
    await seedUser({ email: 'admin@review.test', role: 'ADMIN' });
    admin = await loginAs(app, 'admin@review.test');
  });
  afterEach(async () => {
    await app.close();
  });
  afterAll(async () => {
    await testPrisma.$disconnect();
    await resetRedisTestDb();
  });

  it('restricts management to admins and keeps full codes and token hashes out of listings', async () => {
    await request(app.getHttpServer()).get('/reviewers').expect(401);
    const kiosk = await seedKiosk();
    for (const role of ['KIOSK_OWNER', 'LOCATION_MANAGER'] as const) {
      await seedUser({ email: role + '@review.test', role, kioskId: kiosk.id });
      const token = await loginAs(app, role + '@review.test');
      await request(app.getHttpServer())
        .get('/reviewers')
        .auth(token, { type: 'bearer' })
        .expect(403);
      await request(app.getHttpServer())
        .post('/reviewers')
        .auth(token, { type: 'bearer' })
        .send(payload())
        .expect(403);
      await request(app.getHttpServer())
        .patch('/reviewers/access')
        .auth(token, { type: 'bearer' })
        .send({ enabled: true })
        .expect(403);
    }
    const created = await invite();
    expect(created.code).toMatch(/^REV-/);
    const list = (
      await request(app.getHttpServer())
        .get('/reviewers')
        .set(authorized())
        .expect(200)
    ).body;
    expect(JSON.stringify(list)).not.toContain(created.code);
    expect(JSON.stringify(list)).not.toMatch(/codeHash|tokenHash/);
  });

  it('activates without a device and retries redemption without consuming another installation', async () => {
    const created = await invite();
    const token = await activate(created.code.toLowerCase());
    await activate(created.code, token);
    expect(await testPrisma.reviewerSession.count()).toBe(1);
    await status(token).expect(200, {
      kioskStatus: 'ACTIVE',
      deviceActive: true,
    });
    await request(app.getHttpServer())
      .get('/public/devices/me/status')
      .auth(token, { type: 'bearer' })
      .expect(401);
    await request(app.getHttpServer())
      .get('/reviewers')
      .auth(token, { type: 'bearer' })
      .expect(401);
    expect(await testPrisma.device.count()).toBe(0);
    await request(app.getHttpServer())
      .post('/reviewer-access/redeem')
      .send({ code: created.code, token: newToken() })
      .expect(400);
  });

  it('enforces installation limits under simultaneous activation', async () => {
    const created = await invite();
    const service = app.get(ReviewersService);
    const code = created.code.replaceAll('-', '');
    const results = await Promise.allSettled(
      Array.from({ length: 4 }, () =>
        service.redeem({ code, token: newToken() }),
      ),
    );
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(await testPrisma.reviewerSession.count()).toBe(1);
  });

  it('blocks paused, revoked and expired sessions on every request', async () => {
    const created = await invite();
    const token = await activate(created.code);
    await request(app.getHttpServer())
      .patch('/reviewers/access')
      .set(authorized())
      .send({ enabled: false })
      .expect(200);
    await status(token).expect(401);
    await request(app.getHttpServer())
      .post('/reviewer-access/redeem')
      .send({ code: created.code, token })
      .expect(401);
    await request(app.getHttpServer())
      .patch('/reviewers/access')
      .set(authorized())
      .send({ enabled: true })
      .expect(200);
    await status(token).expect(200);
    await testPrisma.reviewerInvite.update({
      where: { id: created.id },
      data: { expiresAt: new Date(Date.now() - 1) },
    });
    await status(token).expect(401);
    await testPrisma.reviewerInvite.update({
      where: { id: created.id },
      data: { expiresAt: new Date(Date.now() + 86400_000) },
    });
    await request(app.getHttpServer())
      .post(`/reviewers/${created.id}/revoke`)
      .set(authorized())
      .expect(201);
    await status(token).expect(401);
    await request(app.getHttpServer())
      .post('/reviewer-access/redeem')
      .send({ code: created.code, token })
      .expect(401);
  });

  it('uses the same merchant data while isolating savings, attribution and coupon statistics', async () => {
    const created = await invite();
    const token = await activate(created.code);
    const merchant = await seedMerchant();
    const coupon = await seedCoupon(merchant.id);
    const api = app.getHttpServer();
    const lookup = await request(api)
      .get(`/reviewer-public/merchants/by-domain/${merchant.domain}`)
      .auth(token, { type: 'bearer' })
      .expect(200);
    expect(lookup.body.coupons[0].code).toBe(coupon.code);
    const event = {
      eventId: randomUUID(),
      merchantId: merchant.id,
      couponId: coupon.id,
      result: 'applied',
      isFinal: true,
      discountAmount: 5,
    };
    for (let i = 0; i < 2; i++)
      await request(api)
        .post('/reviewer-public/coupon-test-events')
        .auth(token, { type: 'bearer' })
        .send(event)
        .expect(201);
    await request(api)
      .post('/reviewer-public/coupon-test-events')
      .auth(token, { type: 'bearer' })
      .send({ ...event, discountAmount: 50 })
      .expect(400);
    await request(api)
      .get('/reviewer-public/devices/me/savings')
      .auth(token, { type: 'bearer' })
      .expect(200, { lifetimeSaved: 5 });
    await request(api)
      .post('/reviewer-public/attribution-attempts')
      .auth(token, { type: 'bearer' })
      .send({ merchantId: merchant.id })
      .expect(201);
    expect(await testPrisma.reviewerAttribution.count()).toBe(1);
    expect(await testPrisma.attributionAttempt.count()).toBe(0);
    expect(await testPrisma.couponTestEvent.count()).toBe(0);
    expect(await testPrisma.commissionEvent.count()).toBe(0);
    expect(
      (await testPrisma.coupon.findUniqueOrThrow({ where: { id: coupon.id } }))
        .successCount,
    ).toBe(coupon.successCount);
  });

  it('keeps normal device authentication unchanged and rejects device tokens on reviewer endpoints', async () => {
    const kiosk = await seedKiosk();
    const location = await seedLocation(kiosk.id);
    const device = await seedDeviceWithToken(location.id);
    await request(app.getHttpServer())
      .get('/public/devices/me/status')
      .auth(device.rawToken, { type: 'bearer' })
      .expect(200);
    await status(device.rawToken).expect(401);
  });

  it('validates expiry and installation limits and throttles code guessing', async () => {
    await request(app.getHttpServer())
      .post('/reviewers')
      .set(authorized())
      .send({ ...payload(), expiresAt: new Date(0).toISOString() })
      .expect(400);
    await request(app.getHttpServer())
      .post('/reviewers')
      .set(authorized())
      .send({ ...payload(), maxInstallations: 0 })
      .expect(400);
    for (let i = 0; i < 5; i++)
      await request(app.getHttpServer())
        .post('/reviewer-access/redeem')
        .send({ code: 'REV-' + 'AAAA-'.repeat(5) + 'AAAA', token: newToken() })
        .expect(401);
    await request(app.getHttpServer())
      .post('/reviewer-access/redeem')
      .send({ code: 'REV-' + 'AAAA-'.repeat(5) + 'AAAA', token: newToken() })
      .expect(429);
  });
});
