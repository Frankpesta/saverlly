import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { resetDatabase, testPrisma } from './utils/db';
import { loginAs, seedCoupon, seedMerchant, seedUser } from './utils/fixtures';
import { createTestApp } from './utils/test-app';

describe('Merchants & Coupons (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
    await testPrisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDatabase();
    await seedUser({ email: 'admin@test.com', role: 'ADMIN' });
    adminToken = await loginAs(app, 'admin@test.com');
  });

  it('creates a merchant with a tracking method and zero coupon-sourcing methods — fully valid', async () => {
    const res = await request(app.getHttpServer())
      .post('/merchants')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'No API Store',
        domain: 'noapistore.test',
        attributionMethod: 'COOKIE',
        affiliateTrackingUrl: 'https://track.noapistore.test',
      })
      .expect(201);

    expect(res.body.affiliateProgramId).toBeNull();
    expect(res.body.active).toBe(true);
  });

  it('rejects a merchant missing the tracking fields its attributionMethod requires', async () => {
    await request(app.getHttpServer())
      .post('/merchants')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Bad', domain: 'bad.test', attributionMethod: 'URL_PARAM' })
      .expect(400);
  });

  it('saves and retrieves a checkoutRecipe unchanged', async () => {
    const recipe = {
      couponFieldSelector: "input[name='promo']",
      applyButtonSelector: 'button.apply',
      checkoutUrlPatterns: ['/checkout', '/cart/checkout'],
    };

    const createRes = await request(app.getHttpServer())
      .post('/merchants')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Recipe Store',
        domain: 'recipestore.test',
        attributionMethod: 'COOKIE',
        affiliateTrackingUrl: 'https://track.recipestore.test',
        checkoutRecipe: recipe,
      })
      .expect(201);

    const getRes = await request(app.getHttpServer())
      .get(`/merchants/${createRes.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(getRes.body.checkoutRecipe).toEqual(recipe);
  });

  it('rejects a duplicate merchant domain with 409', async () => {
    await seedMerchant({ domain: 'dupe.test' });

    await request(app.getHttpServer())
      .post('/merchants')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Dupe',
        domain: 'dupe.test',
        attributionMethod: 'COOKIE',
        affiliateTrackingUrl: 'https://track.dupe.test',
      })
      .expect(409);
  });

  it('creates a manual coupon and rejects a duplicate (merchantId, code) with 409', async () => {
    const merchant = await seedMerchant();

    await request(app.getHttpServer())
      .post('/coupons')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ merchantId: merchant.id, code: 'SAVE10' })
      .expect(201);

    await request(app.getHttpServer())
      .post('/coupons')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ merchantId: merchant.id, code: 'SAVE10' })
      .expect(409);
  });

  it('filters coupons by merchantId', async () => {
    const merchantA = await seedMerchant();
    const merchantB = await seedMerchant();
    await seedCoupon(merchantA.id);
    await seedCoupon(merchantB.id);

    const res = await request(app.getHttpServer())
      .get(`/coupons?merchantId=${merchantA.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body).toHaveLength(1);
    expect(res.body[0].merchantId).toBe(merchantA.id);
  });
});
