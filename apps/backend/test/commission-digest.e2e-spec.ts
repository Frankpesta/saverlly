import { INestApplication } from '@nestjs/common';
import { CommissionsService } from '../src/commissions/commissions.service';
import { resetDatabase, resetRedisTestDb, testPrisma } from './utils/db';
import {
  seedDevice,
  seedKiosk,
  seedLocation,
  seedMerchant,
  seedUser,
} from './utils/fixtures';
import { createTestApp } from './utils/test-app';

describe('Commission digest (e2e)', () => {
  let app: INestApplication;
  let commissions: CommissionsService;

  beforeAll(async () => {
    await resetRedisTestDb();
    app = await createTestApp();
    commissions = app.get(CommissionsService);
  });

  afterAll(async () => {
    await app.close();
    await testPrisma.$disconnect();
    await resetRedisTestDb();
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  async function seedKioskWithOwner(revenueSharePct = 30) {
    const kiosk = await seedKiosk({ revenueSharePct });
    const owner = await seedUser({
      email: `owner-${kiosk.id}@test.com`,
      role: 'KIOSK_OWNER',
      kioskId: kiosk.id,
    });
    const location = await seedLocation(kiosk.id);
    const device = await seedDevice(location.id);
    const merchant = await seedMerchant();
    return { kiosk, owner, device, merchant };
  }

  it('notifies the owner with confirmed + reversed totals from the last 24h only', async () => {
    const { kiosk, owner, device, merchant } = await seedKioskWithOwner();
    const now = new Date();
    const twoDaysAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);

    // Within window: one confirmed, one reversed.
    await testPrisma.commissionEvent.create({
      data: {
        deviceId: device.id,
        merchantId: merchant.id,
        networkReference: 'ref-confirmed-recent',
        orderValue: 100,
        commissionAmount: 10,
        kioskShareAmount: 3,
        status: 'CONFIRMED',
        reportedAt: now,
        confirmedAt: now,
      },
    });
    await testPrisma.commissionEvent.create({
      data: {
        deviceId: device.id,
        merchantId: merchant.id,
        networkReference: 'ref-reversed-recent',
        orderValue: 50,
        commissionAmount: 5,
        kioskShareAmount: 0,
        status: 'REVERSED',
        reportedAt: now,
        reversedAt: now,
      },
    });
    // Outside window — must not be counted.
    await testPrisma.commissionEvent.create({
      data: {
        deviceId: device.id,
        merchantId: merchant.id,
        networkReference: 'ref-confirmed-old',
        orderValue: 200,
        commissionAmount: 20,
        kioskShareAmount: 6,
        status: 'CONFIRMED',
        reportedAt: twoDaysAgo,
        confirmedAt: twoDaysAgo,
      },
    });

    await commissions.sendDailyDigests();

    const notification = await testPrisma.notification.findFirstOrThrow({
      where: { userId: owner.id },
    });
    expect(notification.type).toBe('COMMISSION_DIGEST');
    expect(notification.body).toContain('1 confirmed');
    expect(notification.body).toContain('$3.00');
    void kiosk;
  });

  it('skips kiosks with no confirmed/reversed activity in the last 24h', async () => {
    const { owner } = await seedKioskWithOwner();

    await commissions.sendDailyDigests();

    const count = await testPrisma.notification.count({
      where: { userId: owner.id },
    });
    expect(count).toBe(0);
  });

  it('skips a kiosk with no owner user', async () => {
    const kiosk = await seedKiosk();
    const location = await seedLocation(kiosk.id);
    const device = await seedDevice(location.id);
    const merchant = await seedMerchant();
    await testPrisma.commissionEvent.create({
      data: {
        deviceId: device.id,
        merchantId: merchant.id,
        networkReference: 'ref-no-owner',
        orderValue: 100,
        commissionAmount: 10,
        kioskShareAmount: 3,
        status: 'CONFIRMED',
        reportedAt: new Date(),
        confirmedAt: new Date(),
      },
    });

    // Should not throw despite no owner existing to notify.
    await expect(commissions.sendDailyDigests()).resolves.toBeUndefined();
  });
});
