import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { resetDatabase, testPrisma } from './utils/db';
import {
  seedAnnouncement,
  seedCoupon,
  seedDeviceWithToken,
  seedKiosk,
  seedLocation,
  seedMerchant,
} from './utils/fixtures';
import { createTestApp } from './utils/test-app';

describe('Public device-facing API (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
    await testPrisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  async function seedDeviceToken() {
    const kiosk = await seedKiosk();
    const location = await seedLocation(kiosk.id);
    return seedDeviceWithToken(location.id);
  }

  it('returns kioskStatus ACTIVE and deviceActive true for a valid device token', async () => {
    const { rawToken } = await seedDeviceToken();

    const res = await request(app.getHttpServer())
      .get('/public/devices/me/status')
      .set('Authorization', `Bearer ${rawToken}`)
      .expect(200);

    expect(res.body).toEqual({ kioskStatus: 'ACTIVE', deviceActive: true });
  });

  it('401s a status check with no device token', async () => {
    await request(app.getHttpServer())
      .get('/public/devices/me/status')
      .expect(401);
  });

  it('401s a merchant lookup with no device token', async () => {
    await request(app.getHttpServer())
      .get('/public/merchants/by-domain/example.test')
      .expect(401);
  });

  it('401s a merchant lookup with a bogus device token', async () => {
    await request(app.getHttpServer())
      .get('/public/merchants/by-domain/example.test')
      .set('Authorization', 'Bearer nonsense')
      .expect(401);
  });

  it('returns an active merchant with only its active coupons, given a valid device token', async () => {
    const { rawToken } = await seedDeviceToken();
    const merchant = await seedMerchant({
      domain: 'lookup.test',
      checkoutRecipe: { couponFieldSelector: '#promo' },
    });
    await seedCoupon(merchant.id, { code: 'ACTIVE1', active: true });
    await seedCoupon(merchant.id, { code: 'INACTIVE1', active: false });

    const res = await request(app.getHttpServer())
      .get('/public/merchants/by-domain/lookup.test')
      .set('Authorization', `Bearer ${rawToken}`)
      .expect(200);

    expect(res.body.domain).toBe('lookup.test');
    expect(res.body.checkoutRecipe).toEqual({ couponFieldSelector: '#promo' });
    expect(res.body.coupons).toHaveLength(1);
    expect(res.body.coupons[0].code).toBe('ACTIVE1');
  });

  it('404s for an inactive merchant', async () => {
    const { rawToken } = await seedDeviceToken();
    await seedMerchant({ domain: 'inactive.test', active: false });

    await request(app.getHttpServer())
      .get('/public/merchants/by-domain/inactive.test')
      .set('Authorization', `Bearer ${rawToken}`)
      .expect(404);
  });

  it('404s for a domain with no merchant at all', async () => {
    const { rawToken } = await seedDeviceToken();

    await request(app.getHttpServer())
      .get('/public/merchants/by-domain/never-registered.test')
      .set('Authorization', `Bearer ${rawToken}`)
      .expect(404);
  });

  it('records a coupon-test-event and increments successCount on "applied"', async () => {
    const { rawToken } = await seedDeviceToken();
    const merchant = await seedMerchant();
    const coupon = await seedCoupon(merchant.id);

    await request(app.getHttpServer())
      .post('/public/coupon-test-events')
      .set('Authorization', `Bearer ${rawToken}`)
      .send({
        merchantId: merchant.id,
        couponId: coupon.id,
        result: 'applied',
        discountAmount: 5,
      })
      .expect(201);

    const updated = await testPrisma.coupon.findUniqueOrThrow({
      where: { id: coupon.id },
    });
    expect(updated.successCount).toBe(1);
    expect(updated.failCount).toBe(0);
    expect(updated.lastTestedAt).not.toBeNull();
  });

  it('records a suppressed_stepdown event with no couponId, without touching any coupon counters', async () => {
    const { rawToken } = await seedDeviceToken();
    const merchant = await seedMerchant();

    const res = await request(app.getHttpServer())
      .post('/public/coupon-test-events')
      .set('Authorization', `Bearer ${rawToken}`)
      .send({ merchantId: merchant.id, result: 'suppressed_stepdown' })
      .expect(201);

    expect(res.body.couponId).toBeNull();
  });

  it('persists discountAmount on an "applied" event', async () => {
    const { rawToken } = await seedDeviceToken();
    const merchant = await seedMerchant();
    const coupon = await seedCoupon(merchant.id);

    const res = await request(app.getHttpServer())
      .post('/public/coupon-test-events')
      .set('Authorization', `Bearer ${rawToken}`)
      .send({
        merchantId: merchant.id,
        couponId: coupon.id,
        result: 'applied',
        discountAmount: 16,
      })
      .expect(201);

    expect(res.body.discountAmount).toBe(16);
  });

  it('ignores a discountAmount sent alongside a non-"applied" result', async () => {
    const { rawToken } = await seedDeviceToken();
    const merchant = await seedMerchant();
    const coupon = await seedCoupon(merchant.id);

    const res = await request(app.getHttpServer())
      .post('/public/coupon-test-events')
      .set('Authorization', `Bearer ${rawToken}`)
      .send({
        merchantId: merchant.id,
        couponId: coupon.id,
        result: 'failed',
        discountAmount: 16,
      })
      .expect(201);

    expect(res.body.discountAmount).toBeNull();
  });

  it('returns 0 lifetime savings for a device with no applied events', async () => {
    const { rawToken } = await seedDeviceToken();

    const res = await request(app.getHttpServer())
      .get('/public/devices/me/savings')
      .set('Authorization', `Bearer ${rawToken}`)
      .expect(200);

    expect(res.body).toEqual({ lifetimeSaved: 0 });
  });

  it('401s a lifetime savings check with no device token', async () => {
    await request(app.getHttpServer())
      .get('/public/devices/me/savings')
      .expect(401);
  });

  it('sums discountAmount across applied events, ignoring failed/suppressed events and other devices', async () => {
    const { rawToken } = await seedDeviceToken();
    const { rawToken: otherDeviceToken } = await seedDeviceToken();
    const merchant = await seedMerchant();
    const coupon = await seedCoupon(merchant.id);

    const record = (token: string, result: string, discountAmount?: number) =>
      request(app.getHttpServer())
        .post('/public/coupon-test-events')
        .set('Authorization', `Bearer ${token}`)
        .send({
          merchantId: merchant.id,
          couponId: coupon.id,
          result,
          discountAmount,
        })
        .expect(201);

    await record(rawToken, 'applied', 10);
    await record(rawToken, 'applied', 6.5);
    await record(rawToken, 'failed');
    await record(otherDeviceToken, 'applied', 100); // must not count toward the first device's total

    const res = await request(app.getHttpServer())
      .get('/public/devices/me/savings')
      .set('Authorization', `Bearer ${rawToken}`)
      .expect(200);

    expect(res.body).toEqual({ lifetimeSaved: 16.5 });
  });

  it('sums 0.10 + 0.20 to an exact 0.30, avoiding floating-point drift', async () => {
    const { rawToken } = await seedDeviceToken();
    const merchant = await seedMerchant();
    const coupon = await seedCoupon(merchant.id);

    const record = (discountAmount: number) =>
      request(app.getHttpServer())
        .post('/public/coupon-test-events')
        .set('Authorization', `Bearer ${rawToken}`)
        .send({
          merchantId: merchant.id,
          couponId: coupon.id,
          result: 'applied',
          discountAmount,
        })
        .expect(201);

    await record(0.1);
    await record(0.2);

    const res = await request(app.getHttpServer())
      .get('/public/devices/me/savings')
      .set('Authorization', `Bearer ${rawToken}`)
      .expect(200);

    expect(res.body).toEqual({ lifetimeSaved: 0.3 });
  });

  it("returns announcements scoped to all locations or this device's own location, within the active time window", async () => {
    const kiosk = await seedKiosk();
    const location = await seedLocation(kiosk.id);
    const otherLocation = await seedLocation(kiosk.id);
    const { device, rawToken } = await seedDeviceWithToken(location.id);

    const allLocations = await seedAnnouncement(kiosk.id, { title: 'All' });
    const thisLocationOnly = await seedAnnouncement(kiosk.id, {
      title: 'Mine',
      locationIds: [device.locationId],
    });
    await seedAnnouncement(kiosk.id, {
      title: 'Other',
      locationIds: [otherLocation.id],
    });
    await seedAnnouncement(kiosk.id, {
      title: 'Not started yet',
      startAt: new Date(Date.now() + 60_000),
      endAt: new Date(Date.now() + 120_000),
    });
    await seedAnnouncement(kiosk.id, {
      title: 'Already ended',
      startAt: new Date(Date.now() - 120_000),
      endAt: new Date(Date.now() - 60_000),
    });

    const res = await request(app.getHttpServer())
      .get('/public/announcements/active')
      .set('Authorization', `Bearer ${rawToken}`)
      .expect(200);

    const titles = res.body.map((a: { title: string }) => a.title).sort();
    expect(titles).toEqual([allLocations.title, thisLocationOnly.title].sort());
  });

  it("never returns another kiosk's announcements to a device", async () => {
    const kiosk = await seedKiosk();
    const otherKiosk = await seedKiosk();
    const location = await seedLocation(kiosk.id);
    const { rawToken } = await seedDeviceWithToken(location.id);
    await seedAnnouncement(otherKiosk.id, { title: 'Not mine' });

    const res = await request(app.getHttpServer())
      .get('/public/announcements/active')
      .set('Authorization', `Bearer ${rawToken}`)
      .expect(200);

    expect(res.body).toHaveLength(0);
  });

  it('returns a platform-wide broadcast to a device regardless of its kiosk', async () => {
    const kiosk = await seedKiosk();
    const location = await seedLocation(kiosk.id);
    const { rawToken } = await seedDeviceWithToken(location.id);
    const broadcast = await seedAnnouncement(null, { title: 'Broadcast' });

    const res = await request(app.getHttpServer())
      .get('/public/announcements/active')
      .set('Authorization', `Bearer ${rawToken}`)
      .expect(200);

    const titles = res.body.map((a: { title: string }) => a.title);
    expect(titles).toEqual([broadcast.title]);
  });

  it('401s an active-announcements check with no device token', async () => {
    await request(app.getHttpServer())
      .get('/public/announcements/active')
      .expect(401);
  });

  it('400s an "applied" coupon-test-event with no discountAmount', async () => {
    const { rawToken } = await seedDeviceToken();
    const merchant = await seedMerchant();
    const coupon = await seedCoupon(merchant.id);

    await request(app.getHttpServer())
      .post('/public/coupon-test-events')
      .set('Authorization', `Bearer ${rawToken}`)
      .send({ merchantId: merchant.id, couponId: coupon.id, result: 'applied' })
      .expect(400);
  });

  it('mints a sub-ID and logs an AttributionAttempt for the calling device', async () => {
    const { device, rawToken } = await seedDeviceToken();
    const merchant = await seedMerchant();

    const res = await request(app.getHttpServer())
      .post('/public/attribution-attempts')
      .set('Authorization', `Bearer ${rawToken}`)
      .send({ merchantId: merchant.id })
      .expect(201);

    expect(typeof res.body.subId).toBe('string');
    expect(res.body.subId.length).toBeGreaterThan(0);

    const attempt = await testPrisma.attributionAttempt.findUniqueOrThrow({
      where: { subId: res.body.subId },
    });
    expect(attempt.deviceId).toBe(device.id);
    expect(attempt.merchantId).toBe(merchant.id);
  });

  it('mints a distinct sub-ID on every attempt, even for the same device+merchant', async () => {
    const { rawToken } = await seedDeviceToken();
    const merchant = await seedMerchant();

    const mint = () =>
      request(app.getHttpServer())
        .post('/public/attribution-attempts')
        .set('Authorization', `Bearer ${rawToken}`)
        .send({ merchantId: merchant.id })
        .expect(201);

    const first = await mint();
    const second = await mint();

    expect(first.body.subId).not.toBe(second.body.subId);
  });

  it('400s minting an attribution attempt for a merchantId that does not exist', async () => {
    const { rawToken } = await seedDeviceToken();

    await request(app.getHttpServer())
      .post('/public/attribution-attempts')
      .set('Authorization', `Bearer ${rawToken}`)
      .send({ merchantId: '00000000-0000-0000-0000-000000000000' })
      .expect(400);
  });

  it('401s minting an attribution attempt with no device token', async () => {
    await request(app.getHttpServer())
      .post('/public/attribution-attempts')
      .send({ merchantId: '00000000-0000-0000-0000-000000000000' })
      .expect(401);
  });
});
