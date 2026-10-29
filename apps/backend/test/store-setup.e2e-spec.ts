import { INestApplication } from '@nestjs/common';
import { randomBytes } from 'crypto';
import type {
  CurrentStoreSetupSessionResponse,
  IssuedStoreSetupCode,
  RedeemStoreSetupCodeResponse,
  StoreSetupExtensionSession,
  StoreSetupSessionView,
} from '@saverlly/shared-types';
import type { Merchant } from '@prisma/client';
import request from 'supertest';
import { resetDatabase, resetRedisTestDb, testPrisma } from './utils/db';
import {
  loginAs,
  seedDeviceWithToken,
  seedKiosk,
  seedLocation,
  seedMerchant,
  seedUser,
} from './utils/fixtures';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './utils/test-app';

describe('Store setup sessions', () => {
  let app: INestApplication;
  let admin: string;
  let adminId: string;
  let merchantId: string;

  const LIVE_RECIPE = {
    couponFieldSelector: '#live-promo',
    applyButtonSelector: '#live-apply',
    cartTotalSelector: '#live-total',
    checkoutUrlPatterns: ['/live-checkout'],
  };
  const recipe = () => ({
    couponFieldSelector: 'input[name="discount"]',
    applyButtonSelector: 'button.apply-discount',
    cartTotalSelector: '.order-summary .total',
    failureIndicatorSelector: '[role="alert"]',
    checkoutUrlPatterns: ['/checkouts/*'],
    couponApplyMode: 'replace',
  });
  const TESTED_AT = new Date().toISOString();
  const testResult = () => ({
    passed: true,
    checks: [
      { key: 'promoField', outcome: 'pass', detail: 'Found the promo box' },
      {
        key: 'failureMessage',
        outcome: 'pass',
        detail: 'Store rejected the test code',
      },
      { key: 'cartTotal', outcome: 'pass' },
    ],
    cartTotal: 84.2,
    testedAt: TESTED_AT,
  });
  const ANY_STRING: unknown = expect.any(String);
  const body = <T>(res: { body: unknown }) => res.body as T;
  const message = (res: { body: unknown }) =>
    body<{ message: string | string[] }>(res).message;
  const newToken = () => randomBytes(32).toString('base64url');
  const http = () => request(app.getHttpServer());
  const asAdmin = () => ({ Authorization: `Bearer ${admin}` });
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function issue(id = merchantId) {
    const res = await http()
      .post(`/merchants/${id}/setup-sessions`)
      .set(asAdmin())
      .expect(201);
    return body<IssuedStoreSetupCode>(res);
  }
  function redeem(code: string, token: string) {
    return http().post('/store-setup/redeem').send({ code, token });
  }
  async function connect() {
    const { code, session } = await issue();
    const token = newToken();
    await redeem(code, token).expect(200);
    return { code, token, sessionId: session.id };
  }
  function submit(
    token: string,
    body: object = { recipe: recipe(), testResult: testResult() },
  ) {
    return http()
      .post('/store-setup/session/recipe')
      .set(bearer(token))
      .send(body);
  }
  const current = async (): Promise<StoreSetupSessionView | null> =>
    body<CurrentStoreSetupSessionResponse>(
      await http()
        .get(`/merchants/${merchantId}/setup-sessions/current`)
        .set(asAdmin())
        .expect(200),
    ).session;
  const sessionGet = (token: string) =>
    http().get('/store-setup/session').set(bearer(token));

  beforeAll(async () => {
    await resetRedisTestDb();
  });
  beforeEach(async () => {
    await resetDatabase();
    app = await createTestApp();
    adminId = (await seedUser({ email: 'admin@setup.test', role: 'ADMIN' })).id;
    admin = await loginAs(app, 'admin@setup.test');
    merchantId = (
      await seedMerchant({ domain: 'shop.test', checkoutRecipe: LIVE_RECIPE })
    ).id;
  });
  afterEach(async () => {
    await app.close();
  });
  afterAll(async () => {
    await testPrisma.$disconnect();
    await resetRedisTestDb();
  });

  describe('admin endpoints', () => {
    it('are restricted to admins', async () => {
      await http().post(`/merchants/${merchantId}/setup-sessions`).expect(401);
      const kiosk = await seedKiosk();
      await seedUser({
        email: 'owner@setup.test',
        role: 'KIOSK_OWNER',
        kioskId: kiosk.id,
      });
      const owner = await loginAs(app, 'owner@setup.test');
      await http()
        .post(`/merchants/${merchantId}/setup-sessions`)
        .set(bearer(owner))
        .expect(403);
      await http()
        .get(`/merchants/${merchantId}/setup-sessions/current`)
        .set(bearer(owner))
        .expect(403);
    });

    it('issues a display-formatted code once and never exposes hashes', async () => {
      const { code, session } = await issue();
      expect(code).toMatch(/^SET-[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/);
      expect(session).toMatchObject({
        merchantId,
        state: 'PENDING',
        extensionActive: false,
        createdById: adminId,
        draftRecipe: null,
      });
      const view = await current();
      expect(view?.id).toBe(session.id);
      for (const body of [session, view]) {
        expect(body).not.toHaveProperty('codeHash');
        expect(body).not.toHaveProperty('tokenHash');
        expect(JSON.stringify(body)).not.toContain(code.replace(/-/g, ''));
      }
      const row = await testPrisma.storeSetupSession.findUniqueOrThrow({
        where: { id: session.id },
      });
      expect(row.codeHash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('returns null when the store has never had a session, and 404s for unknown stores', async () => {
      expect(await current())?.toBeNull();
      const unknown = '00000000-0000-4000-8000-000000000000';
      await http()
        .post(`/merchants/${unknown}/setup-sessions`)
        .set(asAdmin())
        .expect(404);
      await http()
        .get(`/merchants/${unknown}/setup-sessions/current`)
        .set(asAdmin())
        .expect(404);
      await http()
        .post('/merchants/not-a-uuid/setup-sessions')
        .set(asAdmin())
        .expect(400);
    });

    it('cancels the previous code and ends a connected extension when a new code is issued', async () => {
      const first = await connect();
      const { code: pendingCode } = await issue();
      const { session: latest } = await issue();

      await sessionGet(first.token).expect(401);
      await redeem(pendingCode, newToken()).expect(401);
      const rows = await testPrisma.storeSetupSession.findMany({
        where: { merchantId },
      });
      expect(
        rows.filter((r) => r.status !== 'CANCELLED').map((r) => r.id),
      ).toEqual([latest.id]);
    });
  });

  describe('redeeming a code', () => {
    it('accepts the code however the admin types it and returns only the scoped store', async () => {
      const { code, session } = await issue();
      const loose = code.toLowerCase().replace(/^set-/, '').replace('-', ' ');
      const res = await redeem(loose, newToken()).expect(200);
      expect(res.body).toEqual({
        sessionId: session.id,
        expiresAt: ANY_STRING,
        merchant: {
          id: merchantId,
          name: ANY_STRING,
          domain: 'shop.test',
        },
      });
      const hours =
        (Date.parse(body<RedeemStoreSetupCodeResponse>(res).expiresAt) -
          Date.now()) /
        3_600_000;
      expect(hours).toBeGreaterThan(3.9);
      expect(hours).toBeLessThanOrEqual(4);
      expect((await current())?.state).toBe('CONNECTED');
    });

    it('is safe to retry with the same token but single-use for anyone else', async () => {
      const { code } = await issue();
      const token = newToken();
      const first = await redeem(code, token).expect(200);
      const retry = await redeem(code, token).expect(200);
      expect(retry.body).toEqual(first.body);
      const other = await redeem(code, newToken()).expect(401);
      expect(message(other)).toBe('This setup code is invalid or has expired');
    });

    it('rejects unknown, expired and malformed codes', async () => {
      const unknown = await redeem('SET-2222-2222', newToken()).expect(401);
      const { code, session } = await issue();
      await testPrisma.storeSetupSession.update({
        where: { id: session.id },
        data: { codeExpiresAt: new Date(Date.now() - 1000) },
      });
      const expired = await redeem(code, newToken()).expect(401);
      expect(message(expired)).toBe(message(unknown));
      expect((await current())?.state).toBe('EXPIRED');
      await redeem('SET-ILO0-1111', newToken()).expect(400);
      await redeem(code, 'too-short').expect(400);
    });

    it('rejects a token already bound to another setup session', async () => {
      const { token } = await connect();
      const { code } = await issue();
      await redeem(code, token).expect(401);
    });

    it('rejects codes issued by an admin who has since been disabled', async () => {
      const { code } = await issue();
      await testPrisma.user.update({
        where: { id: adminId },
        data: { disabled: true },
      });
      await redeem(code, newToken()).expect(401);
    });

    it('is rate limited per IP', async () => {
      for (let i = 0; i < 5; i++)
        await redeem('SET-2222-2222', newToken()).expect(401);
      await redeem('SET-2222-2222', newToken()).expect(429);
    });
  });

  describe('token scope', () => {
    it('accepts only setup tokens on setup routes, and setup tokens nowhere else', async () => {
      const { token } = await connect();
      const kiosk = await seedKiosk();
      const location = await seedLocation(kiosk.id);
      const { rawToken: deviceToken } = await seedDeviceWithToken(location.id);

      await http().get('/store-setup/session').expect(401);
      await sessionGet(deviceToken).expect(401);
      await sessionGet(admin).expect(401);

      await http()
        .get('/public/devices/me/status')
        .set(bearer(token))
        .expect(401);
      await http()
        .get('/reviewer-public/devices/me/status')
        .set(bearer(token))
        .expect(401);
      await http().get('/merchants').set(bearer(token)).expect(401);
    });

    it('returns the scoped store and its live recipe', async () => {
      const { token, sessionId } = await connect();
      const res = await sessionGet(token).expect(200);
      expect(body<StoreSetupExtensionSession>(res)).toEqual({
        sessionId,
        state: 'CONNECTED',
        expiresAt: ANY_STRING,
        submittedAt: null,
        merchant: {
          id: merchantId,
          name: ANY_STRING,
          domain: 'shop.test',
          checkoutRecipe: LIVE_RECIPE,
        },
      });
    });

    it('ends as soon as it expires', async () => {
      const { token, sessionId } = await connect();
      await testPrisma.storeSetupSession.update({
        where: { id: sessionId },
        data: { sessionExpiresAt: new Date(Date.now() - 1000) },
      });
      await sessionGet(token).expect(401);
      expect(await current())?.toMatchObject({
        state: 'EXPIRED',
        extensionActive: false,
      });
    });

    it('ends when the issuing admin is disabled', async () => {
      const { token } = await connect();
      await testPrisma.user.update({
        where: { id: adminId },
        data: { disabled: true },
      });
      await sessionGet(token).expect(401);
    });
  });

  describe('submitting a draft', () => {
    it('stores the draft for review without touching the live recipe', async () => {
      const { token } = await connect();
      const res = await submit(token).expect(200);
      expect(body<StoreSetupExtensionSession>(res)).toMatchObject({
        state: 'SUBMITTED',
        submittedAt: ANY_STRING,
      });

      const merchant = await testPrisma.merchant.findUniqueOrThrow({
        where: { id: merchantId },
      });
      expect(merchant.checkoutRecipe).toEqual(LIVE_RECIPE);
      expect(await current())?.toMatchObject({
        state: 'SUBMITTED',
        extensionActive: true,
        draftRecipe: recipe(),
        testResult: testResult(),
      });
    });

    it('lets the extension resubmit while the session is open', async () => {
      const { token } = await connect();
      await submit(token).expect(200);
      const revised = { ...recipe(), cartTotalSelector: '#grand-total' };
      await submit(token, { recipe: revised, testResult: testResult() }).expect(
        200,
      );
      expect((await current())?.draftRecipe?.cartTotalSelector).toBe(
        '#grand-total',
      );
    });

    it('validates the recipe exactly like the manual form, and the test result shape', async () => {
      const { token } = await connect();
      const invalid = [
        {
          recipe: { ...recipe(), couponFieldSelector: 'input[' },
          testResult: testResult(),
        },
        {
          recipe: { ...recipe(), couponApplyMode: 'remove' },
          testResult: testResult(),
        },
        {
          recipe: { ...recipe(), checkoutUrlPatterns: [] },
          testResult: testResult(),
        },
        { recipe: { ...recipe(), injected: 'x' }, testResult: testResult() },
        { recipe: recipe(), testResult: { ...testResult(), checks: [] } },
        {
          recipe: recipe(),
          testResult: {
            ...testResult(),
            checks: [
              { key: 'promoField', outcome: 'pass' },
              { key: 'promoField', outcome: 'fail' },
            ],
          },
        },
        {
          recipe: recipe(),
          testResult: {
            ...testResult(),
            checks: [{ key: 'nope', outcome: 'pass' }],
          },
        },
        {
          recipe: recipe(),
          testResult: {
            ...testResult(),
            checks: [
              { key: 'promoField', outcome: 'pass', detail: 'x'.repeat(301) },
            ],
          },
        },
        { recipe: recipe(), testResult: { ...testResult(), cartTotal: -1 } },
        { recipe: recipe() },
        { testResult: testResult() },
        { recipe: 'input', testResult: testResult() },
      ];
      for (const body of invalid) await submit(token, body).expect(400);
      expect((await current())?.state).toBe('CONNECTED');
    });
  });

  describe('saving on the dashboard', () => {
    const apply = (sessionId: string) =>
      http()
        .post(`/merchants/${merchantId}/setup-sessions/${sessionId}/apply`)
        .set(asAdmin());

    it('copies the draft onto the store and ends the session', async () => {
      const { token, sessionId } = await connect();
      await submit(token).expect(200);
      const applied = body<{
        session: StoreSetupSessionView;
        merchant: Merchant;
      }>(await apply(sessionId).expect(200));

      expect(applied.session).toMatchObject({
        state: 'APPLIED',
        extensionActive: false,
        appliedById: adminId,
      });
      expect(applied.merchant.checkoutRecipe).toEqual(recipe());
      const merchant = await testPrisma.merchant.findUniqueOrThrow({
        where: { id: merchantId },
      });
      expect(merchant.checkoutRecipe).toEqual(recipe());

      await sessionGet(token).expect(401);
      await submit(token).expect(401);
      await apply(sessionId).expect(409);
    });

    it('refuses when nothing was submitted, or the session belongs to another store', async () => {
      const { token, sessionId } = await connect();
      await apply(sessionId).expect(409);
      await submit(token).expect(200);
      const other = await seedMerchant();
      await http()
        .post(`/merchants/${other.id}/setup-sessions/${sessionId}/apply`)
        .set(asAdmin())
        .expect(404);
    });

    it('re-validates the draft before it reaches shoppers', async () => {
      const { token, sessionId } = await connect();
      await submit(token).expect(200);
      await testPrisma.storeSetupSession.update({
        where: { id: sessionId },
        data: { draftRecipe: { ...recipe(), applyButtonSelector: 'button[' } },
      });
      const res = await apply(sessionId).expect(400);
      expect(message(res)[0]).toBe(
        'The submitted recipe is no longer valid. Run setup again',
      );
      const merchant = await testPrisma.merchant.findUniqueOrThrow({
        where: { id: merchantId },
      });
      expect(merchant.checkoutRecipe).toEqual(LIVE_RECIPE);
      expect((await current())?.state).toBe('SUBMITTED');
    });

    it('refuses to save if the draft was resubmitted after it was read', async () => {
      const { token, sessionId } = await connect();
      await submit(token).expect(200);
      // Hand apply() the snapshot it would have read just before a resubmission landed.
      const stale = await testPrisma.storeSetupSession.findUniqueOrThrow({
        where: { id: sessionId },
      });
      const prisma = app.get(PrismaService);
      jest.spyOn(prisma.storeSetupSession, 'findFirst').mockResolvedValueOnce({
        ...stale,
        submittedAt: new Date(stale.submittedAt!.getTime() - 1000),
      });

      await apply(sessionId).expect(409);
      const merchant = await testPrisma.merchant.findUniqueOrThrow({
        where: { id: merchantId },
      });
      expect(merchant.checkoutRecipe).toEqual(LIVE_RECIPE);
      expect((await current())?.state).toBe('SUBMITTED');
    });

    it('keeps a submitted draft saveable after the extension session ends', async () => {
      const { token, sessionId } = await connect();
      await submit(token).expect(200);
      await testPrisma.storeSetupSession.update({
        where: { id: sessionId },
        data: { sessionExpiresAt: new Date(Date.now() - 1000) },
      });
      expect(await current())?.toMatchObject({
        state: 'SUBMITTED',
        extensionActive: false,
      });
      await apply(sessionId).expect(200);
    });
  });

  describe('cancelling and ending', () => {
    const cancel = (sessionId: string) =>
      http()
        .post(`/merchants/${merchantId}/setup-sessions/${sessionId}/cancel`)
        .set(asAdmin());

    it('cancels from the dashboard immediately and idempotently', async () => {
      const { token, sessionId } = await connect();
      await submit(token).expect(200);
      const res = await cancel(sessionId).expect(200);
      expect(res.body).toMatchObject({
        state: 'CANCELLED',
        extensionActive: false,
      });
      await sessionGet(token).expect(401);
      await cancel(sessionId).expect(200);
      await http()
        .post(`/merchants/${merchantId}/setup-sessions/${sessionId}/apply`)
        .set(asAdmin())
        .expect(409);
    });

    it('cannot cancel a session already saved to the store', async () => {
      const { token, sessionId } = await connect();
      await submit(token).expect(200);
      await http()
        .post(`/merchants/${merchantId}/setup-sessions/${sessionId}/apply`)
        .set(asAdmin())
        .expect(200);
      await cancel(sessionId).expect(409);
    });

    it('ending from the extension cancels a session with nothing to review', async () => {
      const { token } = await connect();
      await http()
        .post('/store-setup/session/end')
        .set(bearer(token))
        .expect(204);
      await sessionGet(token).expect(401);
      expect(await current())?.toMatchObject({
        state: 'CANCELLED',
        extensionActive: false,
      });
    });

    it('ending from the extension keeps a submitted draft for review', async () => {
      const { token, sessionId } = await connect();
      await submit(token).expect(200);
      await http()
        .post('/store-setup/session/end')
        .set(bearer(token))
        .expect(204);
      await sessionGet(token).expect(401);
      expect(await current())?.toMatchObject({
        id: sessionId,
        state: 'SUBMITTED',
        extensionActive: false,
      });
    });

    it('deleting the store removes its setup sessions', async () => {
      const { sessionId } = await connect();
      await http()
        .delete(`/merchants/${merchantId}`)
        .set(asAdmin())
        .expect(204);
      expect(
        await testPrisma.storeSetupSession.findUnique({
          where: { id: sessionId },
        }),
      ).toBeNull();
    });
  });
});
