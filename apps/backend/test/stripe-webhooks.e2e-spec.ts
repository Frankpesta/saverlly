import { INestApplication } from '@nestjs/common';
import { CommissionStatus } from '@prisma/client';
import request from 'supertest';
import Stripe from 'stripe';
import { resetDatabase, testPrisma } from './utils/db';
import { seedCommissionEvent, seedDevice, seedKiosk, seedLocation, seedMerchant } from './utils/fixtures';
import { createTestApp } from './utils/test-app';

// Webhook signing/verification is pure local HMAC (Stripe.webhooks.generateTestHeaderString
// needs no real API key or network call) — matches .env.test's STRIPE_WEBHOOK_SECRET, a fake
// value used only for this local signing round-trip. Onboarding-link/transfer-creation flows
// need a real Stripe test account and are deferred (see 05-PHASE-5 memory).
const WEBHOOK_SECRET = 'whsec_test_local_signing_secret';
const stripeForSigning = new Stripe('sk_test_unused_for_signing');

function signedPost(app: INestApplication, payload: object) {
  const rawBody = JSON.stringify(payload);
  const signature = stripeForSigning.webhooks.generateTestHeaderString({ payload: rawBody, secret: WEBHOOK_SECRET });
  return request(app.getHttpServer())
    .post('/webhooks/stripe')
    .set('Content-Type', 'application/json')
    .set('stripe-signature', signature)
    .send(rawBody);
}

describe('Stripe webhooks (e2e)', () => {
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

  it('rejects a webhook with an invalid signature', async () => {
    const rawBody = JSON.stringify({ id: 'evt_bad', type: 'account.updated', data: { object: {} } });
    await request(app.getHttpServer())
      .post('/webhooks/stripe')
      .set('Content-Type', 'application/json')
      .set('stripe-signature', 't=1,v1=not-a-real-signature')
      .send(rawBody)
      .expect(400);
  });

  it('rejects a webhook with no signature header', async () => {
    await request(app.getHttpServer())
      .post('/webhooks/stripe')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ id: 'evt_nosig' }))
      .expect(400);
  });

  it('accepts a validly-signed transfer.created event and marks a processing payout paid', async () => {
    const kiosk = await seedKiosk({ revenueSharePct: 30 });
    const location = await seedLocation(kiosk.id);
    const device = await seedDevice(location.id);
    const merchant = await seedMerchant();
    await seedCommissionEvent(device.id, merchant.id, { status: CommissionStatus.CONFIRMED, kioskShareAmount: 5 });
    const payout = await testPrisma.payout.create({
      data: {
        kioskId: kiosk.id,
        periodStart: new Date(),
        periodEnd: new Date(),
        totalAmount: 5,
        status: 'processing',
        stripeTransferId: 'tr_test_123',
      },
    });

    const res = await signedPost(app, {
      id: 'evt_1',
      type: 'transfer.created',
      data: { object: { id: 'tr_test_123', object: 'transfer' } },
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });

    const updated = await testPrisma.payout.findUniqueOrThrow({ where: { id: payout.id } });
    expect(updated.status).toBe('paid');
    expect(updated.paidAt).not.toBeNull();
  });

  it('marks a payout failed on a transfer.reversed event', async () => {
    const kiosk = await seedKiosk();
    const payout = await testPrisma.payout.create({
      data: {
        kioskId: kiosk.id,
        periodStart: new Date(),
        periodEnd: new Date(),
        totalAmount: 5,
        status: 'processing',
        stripeTransferId: 'tr_test_456',
      },
    });

    await signedPost(app, {
      id: 'evt_2',
      type: 'transfer.reversed',
      data: { object: { id: 'tr_test_456', object: 'transfer' } },
    }).expect(200);

    const updated = await testPrisma.payout.findUniqueOrThrow({ where: { id: payout.id } });
    expect(updated.status).toBe('failed');
  });

  it('syncs stripePayoutsEnabled from an account.updated event', async () => {
    const kiosk = await seedKiosk();
    await testPrisma.kiosk.update({ where: { id: kiosk.id }, data: { stripeAccountId: 'acct_test_789' } });

    await signedPost(app, {
      id: 'evt_3',
      type: 'account.updated',
      data: { object: { id: 'acct_test_789', object: 'account', payouts_enabled: true } },
    }).expect(200);

    const updated = await testPrisma.kiosk.findUniqueOrThrow({ where: { id: kiosk.id } });
    expect(updated.stripePayoutsEnabled).toBe(true);
  });

  it('is a no-op (still 200) for an event type this platform does not act on', async () => {
    await signedPost(app, { id: 'evt_4', type: 'charge.succeeded', data: { object: {} } }).expect(200);
  });
});
