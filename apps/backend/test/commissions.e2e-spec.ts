import { INestApplication } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import request from 'supertest';
import { resetDatabase, testPrisma } from './utils/db';
import {
  loginAs,
  seedAffiliateProgram,
  seedAttributionAttempt,
  seedDevice,
  seedKiosk,
  seedLocation,
  seedMerchant,
  seedUser,
} from './utils/fixtures';
import { createTestApp } from './utils/test-app';

describe('Commission events API (e2e)', () => {
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

  async function seedScenario() {
    const kioskA = await seedKiosk({ revenueSharePct: 30 });
    const kioskB = await seedKiosk({ revenueSharePct: 30 });
    const locationA = await seedLocation(kioskA.id);
    const deviceA = await seedDevice(locationA.id);
    const program = await seedAffiliateProgram();
    const merchant = await seedMerchant({ affiliateProgramId: program.id, affiliateSubIdParamKey: 'SubId1' });

    await seedAttributionAttempt(deviceA.id, merchant.id, { subId: 'commissions-e2e-confirm-a' });
    await seedAttributionAttempt(deviceA.id, merchant.id, { subId: 'commissions-e2e-reverse-b' });

    const admin = await seedUser({ email: 'admin@commissions-e2e.test', role: UserRole.ADMIN });
    const ownerA = await seedUser({ email: 'ownerA@commissions-e2e.test', role: UserRole.KIOSK_OWNER, kioskId: kioskA.id });
    const ownerB = await seedUser({ email: 'ownerB@commissions-e2e.test', role: UserRole.KIOSK_OWNER, kioskId: kioskB.id });

    const adminToken = await loginAs(app, admin.email);
    const ownerAToken = await loginAs(app, ownerA.email);
    const ownerBToken = await loginAs(app, ownerB.email);

    return { kioskA, kioskB, merchant, adminToken, ownerAToken, ownerBToken };
  }

  it('admin sync-now ingests and reconciles, returning accurate counts', async () => {
    const { adminToken } = await seedScenario();

    const res = await request(app.getHttpServer())
      .post('/commission-events/sync-now')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body).toEqual({ ingested: 2, confirmed: 1, reversed: 1 });
  });

  it('admin lists all commission events, filterable by kioskId', async () => {
    const { kioskA, adminToken } = await seedScenario();
    await request(app.getHttpServer()).post('/commission-events/sync-now').set('Authorization', `Bearer ${adminToken}`).expect(200);

    const res = await request(app.getHttpServer())
      .get(`/commission-events?kioskId=${kioskA.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body).toHaveLength(2);
  });

  it('admin filters commission events by status', async () => {
    const { adminToken } = await seedScenario();
    await request(app.getHttpServer()).post('/commission-events/sync-now').set('Authorization', `Bearer ${adminToken}`).expect(200);

    const confirmedRes = await request(app.getHttpServer())
      .get('/commission-events?status=CONFIRMED')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(confirmedRes.body).toHaveLength(1);
    expect(confirmedRes.body[0].status).toBe('CONFIRMED');

    const reversedRes = await request(app.getHttpServer())
      .get('/commission-events?status=REVERSED')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(reversedRes.body).toHaveLength(1);
    expect(reversedRes.body[0].status).toBe('REVERSED');
  });

  it('403s a kiosk-owner hitting the admin commission-events endpoints', async () => {
    const { ownerAToken } = await seedScenario();

    await request(app.getHttpServer())
      .get('/commission-events')
      .set('Authorization', `Bearer ${ownerAToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .post('/commission-events/sync-now')
      .set('Authorization', `Bearer ${ownerAToken}`)
      .expect(403);
  });

  it('401s the admin commission-events endpoint with no token', async () => {
    await request(app.getHttpServer()).get('/commission-events').expect(401);
  });

  it('kiosk-owner sees only their own kiosk\'s commission events, never another kiosk\'s', async () => {
    const { adminToken, ownerAToken, ownerBToken } = await seedScenario();
    await request(app.getHttpServer()).post('/commission-events/sync-now').set('Authorization', `Bearer ${adminToken}`).expect(200);

    const mineA = await request(app.getHttpServer())
      .get('/my/commission-events')
      .set('Authorization', `Bearer ${ownerAToken}`)
      .expect(200);
    expect(mineA.body).toHaveLength(2);

    const mineB = await request(app.getHttpServer())
      .get('/my/commission-events')
      .set('Authorization', `Bearer ${ownerBToken}`)
      .expect(200);
    expect(mineB.body).toHaveLength(0);
  });

  it('kiosk-owner balance splits pending (estimated) vs. confirmed-available correctly', async () => {
    const { adminToken, ownerAToken } = await seedScenario();
    await request(app.getHttpServer()).post('/commission-events/sync-now').set('Authorization', `Bearer ${adminToken}`).expect(200);

    const res = await request(app.getHttpServer())
      .get('/my/balance')
      .set('Authorization', `Bearer ${ownerAToken}`)
      .expect(200);

    // 1 CONFIRMED event: commissionAmount 5.00 * 30% = 1.50 available. The REVERSED event
    // contributes nothing to either bucket, and nothing is left PENDING after sync-now.
    expect(res.body).toEqual({ pendingAmount: 0, confirmedAvailableAmount: 1.5 });
  });

  it('excludes a CONFIRMED event already swept into a payout from confirmedAvailableAmount', async () => {
    const { kioskA, adminToken, ownerAToken } = await seedScenario();
    await request(app.getHttpServer()).post('/commission-events/sync-now').set('Authorization', `Bearer ${adminToken}`).expect(200);

    const confirmedEvent = await testPrisma.commissionEvent.findFirstOrThrow({ where: { status: 'CONFIRMED' } });
    const payout = await testPrisma.payout.create({
      data: { kioskId: kioskA.id, periodStart: new Date(), periodEnd: new Date(), totalAmount: 1.5 },
    });
    await testPrisma.commissionEvent.update({ where: { id: confirmedEvent.id }, data: { payoutId: payout.id } });

    const res = await request(app.getHttpServer())
      .get('/my/balance')
      .set('Authorization', `Bearer ${ownerAToken}`)
      .expect(200);

    expect(res.body.confirmedAvailableAmount).toBe(0);
  });

  it('401s the kiosk-owner my/commission-events endpoint with no token', async () => {
    await request(app.getHttpServer()).get('/my/commission-events').expect(401);
  });

  it('403s an admin hitting the kiosk-owner /my endpoints', async () => {
    const { adminToken } = await seedScenario();

    await request(app.getHttpServer())
      .get('/my/commission-events')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(403);
  });
});
