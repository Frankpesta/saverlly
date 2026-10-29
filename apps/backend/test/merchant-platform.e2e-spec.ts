import { INestApplication } from '@nestjs/common';
import type { Merchant } from '@prisma/client';
import request from 'supertest';
import { PlatformDetectionService } from '../src/merchants/platform-detection.service';
import { resetDatabase, testPrisma } from './utils/db';
import { loginAs, seedMerchant, seedUser } from './utils/fixtures';
import { createTestApp } from './utils/test-app';

// Reading a real store's homepage is covered by the unit tests (with a local server); here the
// check itself is stubbed so the suite never reaches out to the internet.
describe('Store platform (e2e)', () => {
  let app: INestApplication;
  let admin: string;
  let check: jest.SpyInstance;

  const ANY_STRING: unknown = expect.any(String);
  const body = <T>(res: { body: unknown }) => res.body as T;
  const http = () => request(app.getHttpServer());
  const recheck = (merchantId: string, token = admin) =>
    http()
      .post(`/merchants/${merchantId}/platform/check`)
      .set('Authorization', `Bearer ${token}`);

  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await app.close();
    await testPrisma.$disconnect();
  });
  beforeEach(async () => {
    await resetDatabase();
    await seedUser({ email: 'admin@platform.test', role: 'ADMIN' });
    admin = await loginAs(app, 'admin@platform.test');
    check = jest
      .spyOn(app.get(PlatformDetectionService), 'check')
      .mockResolvedValue({
        reachable: true,
        detection: {
          platform: 'SHOPIFY',
          evidence: 'cdn.shopify.com in the page',
        },
      });
  });
  afterEach(() => check.mockRestore());

  it("records the store's platform", async () => {
    const merchant = await seedMerchant({ domain: 'shop.test' });
    const res = await recheck(merchant.id).expect(200);
    expect(res.body).toEqual({
      reachable: true,
      platform: 'SHOPIFY',
      evidence: 'cdn.shopify.com in the page',
      checkedAt: ANY_STRING,
    });
    expect(check).toHaveBeenCalledWith('shop.test');
    const saved = await testPrisma.merchant.findUniqueOrThrow({
      where: { id: merchant.id },
    });
    expect(saved.platform).toBe('SHOPIFY');
    expect(saved.platformCheckedAt).not.toBeNull();

    const shown = await http()
      .get(`/merchants/${merchant.id}`)
      .set('Authorization', `Bearer ${admin}`)
      .expect(200);
    expect(body<Merchant>(shown).platform).toBe('SHOPIFY');
  });

  it('records a custom store as unrecognised', async () => {
    check.mockResolvedValue({ reachable: true, detection: null });
    const merchant = await seedMerchant({ domain: 'custom.test' });
    const res = await recheck(merchant.id).expect(200);
    expect(res.body).toMatchObject({
      reachable: true,
      platform: null,
      evidence: null,
    });
  });

  it("keeps the previous answer when the site can't be reached", async () => {
    const merchant = await seedMerchant({ domain: 'shop.test' });
    await recheck(merchant.id).expect(200);
    check.mockResolvedValue({
      reachable: false,
      reason: 'The site took too long to answer',
    });
    const res = await recheck(merchant.id).expect(200);
    expect(res.body).toEqual({
      reachable: false,
      reason: 'The site took too long to answer',
    });
    const saved = await testPrisma.merchant.findUniqueOrThrow({
      where: { id: merchant.id },
    });
    expect(saved.platform).toBe('SHOPIFY');
  });

  it('forgets the platform when the domain changes', async () => {
    const merchant = await seedMerchant({ domain: 'shop.test' });
    await recheck(merchant.id).expect(200);
    const res = await http()
      .patch(`/merchants/${merchant.id}`)
      .set('Authorization', `Bearer ${admin}`)
      .send({ domain: 'other-shop.test' })
      .expect(200);
    expect(res.body).toMatchObject({ platform: null, platformCheckedAt: null });
  });

  it('is for admins only, and 404s for an unknown store', async () => {
    await seedUser({ email: 'owner@platform.test', role: 'KIOSK_OWNER' });
    const owner = await loginAs(app, 'owner@platform.test');
    const merchant = await seedMerchant({ domain: 'shop.test' });
    await recheck(merchant.id, owner).expect(403);
    await recheck('5f0c4d1e-0000-4000-8000-000000000000').expect(404);
    expect(check).not.toHaveBeenCalled();
  });
});
