import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { resetDatabase, testPrisma } from './utils/db';
import { seedCoupon, seedDeviceWithToken, seedKiosk, seedLocation, seedMerchant } from './utils/fixtures';
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

  it('401s a merchant lookup with no device token', async () => {
    await request(app.getHttpServer()).get('/public/merchants/by-domain/example.test').expect(401);
  });

  it('401s a merchant lookup with a bogus device token', async () => {
    await request(app.getHttpServer())
      .get('/public/merchants/by-domain/example.test')
      .set('Authorization', 'Bearer nonsense')
      .expect(401);
  });

  it('returns an active merchant with only its active coupons, given a valid device token', async () => {
    const { rawToken } = await seedDeviceToken();
    const merchant = await seedMerchant({ domain: 'lookup.test', checkoutRecipe: { couponFieldSelector: '#promo' } });
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
      .send({ merchantId: merchant.id, couponId: coupon.id, result: 'applied' })
      .expect(201);

    const updated = await testPrisma.coupon.findUniqueOrThrow({ where: { id: coupon.id } });
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
});
