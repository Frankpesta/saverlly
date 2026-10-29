import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { resetDatabase, testPrisma } from './utils/db';
import {
  loginAs,
  seedDeviceWithToken,
  seedKiosk,
  seedLocation,
  seedMerchant,
  seedUser,
} from './utils/fixtures';
import { createTestApp } from './utils/test-app';

describe('Keeping stores working: recipe health (e2e)', () => {
  let app: INestApplication;
  let merchantId: string;
  let devices: string[];
  let admin: string;

  const RECIPE = {
    couponFieldSelector: '#promo',
    applyButtonSelector: '#apply',
    cartTotalSelector: '#total',
    checkoutUrlPatterns: ['/checkout'],
  };
  const ANY_DATE: unknown = expect.any(Date);
  const http = () => request(app.getHttpServer());
  const report = (token: string, body: object) =>
    http()
      .post('/public/recipe-health')
      .set('Authorization', `Bearer ${token}`)
      .send(body);
  const broken = (token: string) =>
    report(token, { merchantId, ok: false, problem: 'PROMO_BOX_CHANGED' });
  const merchant = () =>
    testPrisma.merchant.findUniqueOrThrow({ where: { id: merchantId } });
  const alerts = () =>
    testPrisma.notification.findMany({
      where: { type: 'STORE_NEEDS_RECHECK' },
    });

  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await app.close();
    await testPrisma.$disconnect();
  });
  beforeEach(async () => {
    await resetDatabase();
    await seedUser({ email: 'admin@health.test', role: 'ADMIN' });
    await seedUser({ email: 'admin2@health.test', role: 'ADMIN' });
    admin = await loginAs(app, 'admin@health.test');
    merchantId = (
      await seedMerchant({ name: 'Demo Outfitters', checkoutRecipe: RECIPE })
    ).id;
    const location = await seedLocation((await seedKiosk()).id);
    devices = [];
    for (let i = 0; i < 3; i++)
      devices.push(
        (await seedDeviceWithToken(location.id, `Device ${i}`)).rawToken,
      );
  });

  it('flags a store once two devices report it broken, and tells every admin once', async () => {
    await broken(devices[0]).expect(204);
    await broken(devices[0]).expect(204);
    expect((await merchant()).recipeNeedsRecheckAt).toBeNull();

    await broken(devices[1]).expect(204);
    expect(await merchant()).toMatchObject({
      recipeNeedsRecheckAt: ANY_DATE,
      recipeProblem: 'PROMO_BOX_CHANGED',
    });
    const sent = await alerts();
    expect(sent).toHaveLength(2);
    expect(sent[0]).toMatchObject({
      title: 'Demo Outfitters needs a quick re-check',
      metadata: { merchantId },
    });

    await broken(devices[2]).expect(204);
    expect(await alerts()).toHaveLength(2);
  });

  it('clears the flag when a checkout finds the store working again', async () => {
    await broken(devices[0]);
    await broken(devices[1]);
    await report(devices[2], { merchantId, ok: true }).expect(204);
    expect((await merchant()).recipeNeedsRecheckAt).toBeNull();

    // Problems reported before that working checkout no longer count.
    await broken(devices[0]);
    expect((await merchant()).recipeNeedsRecheckAt).toBeNull();
  });

  it('starts afresh when a new recipe is saved', async () => {
    await broken(devices[0]);
    await broken(devices[1]);
    const res = await http()
      .patch(`/merchants/${merchantId}`)
      .set('Authorization', `Bearer ${admin}`)
      .send({
        checkoutRecipe: { ...RECIPE, couponFieldSelector: '#new-promo' },
      })
      .expect(200);
    expect(res.body).toMatchObject({
      recipeNeedsRecheckAt: null,
      recipeProblem: null,
    });
    await broken(devices[2]);
    expect((await merchant()).recipeNeedsRecheckAt).toBeNull();
  });

  it('ignores stores with no recipe, and validates reports', async () => {
    const bare = await seedMerchant({ domain: 'bare.test' });
    await report(devices[0], {
      merchantId: bare.id,
      ok: false,
      problem: 'PROMO_BOX_CHANGED',
    }).expect(204);
    expect(await testPrisma.recipeHealthReport.count()).toBe(0);

    await report(devices[0], { merchantId, ok: false }).expect(400);
    await report(devices[0], { merchantId, ok: false, problem: 'NOPE' }).expect(
      400,
    );
    await report(devices[0], {
      merchantId: '5f0c4d1e-0000-4000-8000-000000000000',
      ok: true,
    }).expect(400);
    await http()
      .post('/public/recipe-health')
      .send({ merchantId, ok: true })
      .expect(401);
  });
});
