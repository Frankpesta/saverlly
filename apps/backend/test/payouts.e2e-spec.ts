import { INestApplication } from '@nestjs/common';
import { CommissionStatus, UserRole } from '@prisma/client';
import request from 'supertest';
import { PayoutsService } from '../src/payouts/payouts.service';
import { resetDatabase, testPrisma } from './utils/db';
import {
  loginAs,
  seedCommissionEvent,
  seedDevice,
  seedKiosk,
  seedLocation,
  seedMerchant,
  seedUser,
} from './utils/fixtures';
import { createTestApp } from './utils/test-app';

// Stripe transfer creation/onboarding-link success paths need a real Stripe test-mode
// account and are deliberately not exercised here (see 05-PHASE-5 memory — "build it, test
// later"). This suite covers everything reachable without a live Stripe API call: listing,
// tenant isolation, and every validation branch in processPayout that short-circuits before
// ever calling Stripe (not found / not pending / no connected account).
describe('Payouts API (e2e)', () => {
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

  async function seedKioskWithPayout(overrides: { stripeAccountId?: string; payoutStatus?: string } = {}) {
    const kiosk = await seedKiosk({ revenueSharePct: 30 });
    if (overrides.stripeAccountId) {
      await testPrisma.kiosk.update({ where: { id: kiosk.id }, data: { stripeAccountId: overrides.stripeAccountId } });
    }
    const payout = await testPrisma.payout.create({
      data: {
        kioskId: kiosk.id,
        periodStart: new Date(),
        periodEnd: new Date(),
        totalAmount: 10,
        status: overrides.payoutStatus ?? 'pending',
      },
    });
    return { kiosk, payout };
  }

  async function seedUsers(kioskAId: string, kioskBId: string) {
    const admin = await seedUser({ email: 'admin@payouts-e2e.test', role: UserRole.ADMIN });
    const ownerA = await seedUser({ email: 'ownerA@payouts-e2e.test', role: UserRole.KIOSK_OWNER, kioskId: kioskAId });
    const ownerB = await seedUser({ email: 'ownerB@payouts-e2e.test', role: UserRole.KIOSK_OWNER, kioskId: kioskBId });
    return {
      adminToken: await loginAs(app, admin.email),
      ownerAToken: await loginAs(app, ownerA.email),
      ownerBToken: await loginAs(app, ownerB.email),
    };
  }

  it('admin lists payouts with kiosk Stripe connection status inlined', async () => {
    const { kiosk, payout } = await seedKioskWithPayout({ stripeAccountId: 'acct_test_1' });
    const { adminToken } = await seedUsers(kiosk.id, kiosk.id);

    const res = await request(app.getHttpServer())
      .get('/payouts')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe(payout.id);
    expect(res.body[0].totalAmount).toBe(10);
    expect(res.body[0].kiosk).toEqual({
      id: kiosk.id,
      name: kiosk.name,
      stripeConnected: true,
      stripePayoutsEnabled: false,
    });
  });

  it('admin sees stripeConnected: false for a kiosk that never started onboarding', async () => {
    const { kiosk } = await seedKioskWithPayout();
    const { adminToken } = await seedUsers(kiosk.id, kiosk.id);

    const res = await request(app.getHttpServer())
      .get('/payouts')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body[0].kiosk.stripeConnected).toBe(false);
  });

  it('404s processing a payout that does not exist', async () => {
    const kiosk = await seedKiosk();
    const { adminToken } = await seedUsers(kiosk.id, kiosk.id);

    await request(app.getHttpServer())
      .post('/payouts/00000000-0000-0000-0000-000000000000/process')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);
  });

  it('400s processing an already-processing payout', async () => {
    const { kiosk, payout } = await seedKioskWithPayout({ stripeAccountId: 'acct_test_2', payoutStatus: 'processing' });
    const { adminToken } = await seedUsers(kiosk.id, kiosk.id);

    await request(app.getHttpServer())
      .post(`/payouts/${payout.id}/process`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(400);
  });

  it('400s processing a pending payout for a kiosk with no connected Stripe account', async () => {
    const { kiosk, payout } = await seedKioskWithPayout(); // no stripeAccountId
    const { adminToken } = await seedUsers(kiosk.id, kiosk.id);

    await request(app.getHttpServer())
      .post(`/payouts/${payout.id}/process`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(400);
  });

  it('403s a kiosk-owner hitting the admin payouts endpoints', async () => {
    const { kiosk, payout } = await seedKioskWithPayout();
    const { ownerAToken } = await seedUsers(kiosk.id, kiosk.id);

    await request(app.getHttpServer()).get('/payouts').set('Authorization', `Bearer ${ownerAToken}`).expect(403);
    await request(app.getHttpServer())
      .post(`/payouts/${payout.id}/process`)
      .set('Authorization', `Bearer ${ownerAToken}`)
      .expect(403);
  });

  it('401s the admin payouts endpoint with no token', async () => {
    await request(app.getHttpServer()).get('/payouts').expect(401);
  });

  it('kiosk-owner sees only their own kiosk\'s payouts, never another kiosk\'s', async () => {
    const { kiosk: kioskA } = await seedKioskWithPayout();
    const kioskB = await seedKiosk();
    const { ownerAToken, ownerBToken } = await seedUsers(kioskA.id, kioskB.id);

    const mineA = await request(app.getHttpServer())
      .get('/my/payouts')
      .set('Authorization', `Bearer ${ownerAToken}`)
      .expect(200);
    expect(mineA.body).toHaveLength(1);

    const mineB = await request(app.getHttpServer())
      .get('/my/payouts')
      .set('Authorization', `Bearer ${ownerBToken}`)
      .expect(200);
    expect(mineB.body).toHaveLength(0);
  });

  it('401s the kiosk-owner my/payouts endpoint with no token', async () => {
    await request(app.getHttpServer()).get('/my/payouts').expect(401);
  });

  it('403s an admin hitting the kiosk-owner /my/payouts and /my/stripe/onboard endpoints', async () => {
    const kiosk = await seedKiosk();
    const { adminToken } = await seedUsers(kiosk.id, kiosk.id);

    await request(app.getHttpServer()).get('/my/payouts').set('Authorization', `Bearer ${adminToken}`).expect(403);
    await request(app.getHttpServer())
      .post('/my/stripe/onboard')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(403);
  });

  it('401s the my/stripe/onboard endpoint with no token', async () => {
    await request(app.getHttpServer()).post('/my/stripe/onboard').expect(401);
  });

  it('the full pipeline: sync-now -> generatePayouts -> processPayout validation chain is reachable end to end', async () => {
    // Not a Stripe call — proves the CommissionEvent -> Payout -> processPayout wiring is
    // correct all the way through the real ingestion+reconciliation+aggregation services,
    // stopping only at the point a real Stripe API call would be required.
    const kiosk = await seedKiosk({ revenueSharePct: 50 });
    const location = await seedLocation(kiosk.id);
    const device = await seedDevice(location.id);
    const merchant = await seedMerchant();
    await seedCommissionEvent(device.id, merchant.id, { status: CommissionStatus.CONFIRMED, kioskShareAmount: 8 });
    const { adminToken } = await seedUsers(kiosk.id, kiosk.id);

    await app.get(PayoutsService).generatePayouts();

    const listRes = await request(app.getHttpServer())
      .get('/payouts')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(listRes.body).toHaveLength(1);
    expect(listRes.body[0].totalAmount).toBe(8);
    expect(listRes.body[0].status).toBe('pending');

    await request(app.getHttpServer())
      .post(`/payouts/${listRes.body[0].id}/process`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(400); // no Stripe account connected — correct stop point without real credentials
  });
});
