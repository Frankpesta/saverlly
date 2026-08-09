import { INestApplication } from '@nestjs/common';
import { CommissionsService } from '../src/commissions/commissions.service';
import { resetDatabase, testPrisma } from './utils/db';
import {
  seedAffiliateProgram,
  seedAttributionAttempt,
  seedDevice,
  seedKiosk,
  seedLocation,
  seedMerchant,
} from './utils/fixtures';
import { createTestApp } from './utils/test-app';

describe('Commission ingestion + reconciliation (e2e, real DB, mock adapter)', () => {
  let app: INestApplication;
  let commissions: CommissionsService;

  beforeAll(async () => {
    app = await createTestApp();
    commissions = app.get(CommissionsService);
  });

  afterAll(async () => {
    await app.close();
    await testPrisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  async function seedAttributableDevice(revenueSharePct = 30) {
    const kiosk = await seedKiosk({ revenueSharePct });
    const location = await seedLocation(kiosk.id);
    const device = await seedDevice(location.id);
    const program = await seedAffiliateProgram();
    const merchant = await seedMerchant({ affiliateProgramId: program.id, affiliateSubIdParamKey: 'SubId1' });
    return { kiosk, device, merchant, program };
  }

  it('ingests a new conversion as PENDING with kioskShareAmount 0 until confirmed', async () => {
    const { device, merchant } = await seedAttributableDevice();
    const attempt = await seedAttributionAttempt(device.id, merchant.id, { subId: 'subid-pending-check-a' });

    const result = await commissions.ingestNewConversions();
    expect(result.ingested).toBe(1);

    const event = await testPrisma.commissionEvent.findUniqueOrThrow({ where: { subId: attempt.subId } });
    expect(event.status).toBe('PENDING');
    expect(event.kioskShareAmount.toString()).toBe('0');
    expect(event.deviceId).toBe(device.id);
    expect(event.merchantId).toBe(merchant.id);
  });

  it('skips attribution attempts for a merchant with no affiliate program', async () => {
    const kiosk = await seedKiosk();
    const location = await seedLocation(kiosk.id);
    const device = await seedDevice(location.id);
    const merchant = await seedMerchant(); // no affiliateProgramId
    await seedAttributionAttempt(device.id, merchant.id);

    const result = await commissions.ingestNewConversions();

    expect(result.ingested).toBe(0);
    expect(await testPrisma.commissionEvent.count()).toBe(0);
  });

  it('never re-ingests an already-ingested attribution attempt on repeat sync', async () => {
    const { device, merchant } = await seedAttributableDevice();
    await seedAttributionAttempt(device.id, merchant.id, { subId: 'subid-repeat-check-a' });

    const first = await commissions.ingestNewConversions();
    const second = await commissions.ingestNewConversions();

    expect(first.ingested).toBe(1);
    expect(second.ingested).toBe(0);
    expect(await testPrisma.commissionEvent.count()).toBe(1);
  });

  it('ignores attribution attempts older than the configured pending window', async () => {
    const { device, merchant } = await seedAttributableDevice();
    const ancientDate = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000); // 200 days ago, well past the 90-day default
    await seedAttributionAttempt(device.id, merchant.id, { subId: 'subid-ancient-a', createdAt: ancientDate });

    const result = await commissions.ingestNewConversions();

    expect(result.ingested).toBe(0);
  });

  it('confirms a pending event and locks in kioskShareAmount = commissionAmount * revenueSharePct / 100', async () => {
    const { device, merchant } = await seedAttributableDevice(30);
    // subId ends in an even hex digit -> mock adapter's checkConversionStatuses confirms it
    await seedAttributionAttempt(device.id, merchant.id, { subId: 'subid-confirm-check-a' });

    await commissions.ingestNewConversions();
    const reconcileResult = await commissions.reconcilePendingConversions();

    expect(reconcileResult.confirmed).toBe(1);
    expect(reconcileResult.reversed).toBe(0);

    const event = await testPrisma.commissionEvent.findUniqueOrThrow({ where: { subId: 'subid-confirm-check-a' } });
    expect(event.status).toBe('CONFIRMED');
    expect(event.confirmedAt).not.toBeNull();
    // Mock adapter's fetchConversions fabricates commissionAmount = 5.00 for every sub-ID
    expect(event.kioskShareAmount.toString()).toBe('1.5');
  });

  it('reverses a pending event and zeroes out kioskShareAmount', async () => {
    const { device, merchant } = await seedAttributableDevice(30);
    // subId ends in an odd hex digit -> mock adapter's checkConversionStatuses reverses it
    await seedAttributionAttempt(device.id, merchant.id, { subId: 'subid-reverse-check-b' });

    await commissions.ingestNewConversions();
    const reconcileResult = await commissions.reconcilePendingConversions();

    expect(reconcileResult.reversed).toBe(1);
    expect(reconcileResult.confirmed).toBe(0);

    const event = await testPrisma.commissionEvent.findUniqueOrThrow({ where: { subId: 'subid-reverse-check-b' } });
    expect(event.status).toBe('REVERSED');
    expect(event.reversedAt).not.toBeNull();
    expect(event.kioskShareAmount.toString()).toBe('0');
  });

  it('computes kioskShareAmount with exact decimal precision, no floating-point drift', async () => {
    const { device, merchant } = await seedAttributableDevice(33.33);
    await seedAttributionAttempt(device.id, merchant.id, { subId: 'subid-precision-check-a' });

    await commissions.ingestNewConversions();
    await commissions.reconcilePendingConversions();

    const event = await testPrisma.commissionEvent.findUniqueOrThrow({ where: { subId: 'subid-precision-check-a' } });
    // commissionAmount 5.00 * 33.33% = 1.6665, rounded to the Decimal(10,2) column's scale on write
    expect(event.kioskShareAmount.toString()).toBe('1.67');
  });

  it('syncNow runs ingestion then reconciliation in one pass and is a no-op on repeat calls', async () => {
    const { device, merchant } = await seedAttributableDevice();
    await seedAttributionAttempt(device.id, merchant.id, { subId: 'subid-syncnow-check-a' });

    const first = await commissions.syncNow();
    expect(first.ingested).toBe(1);
    expect(first.confirmed + first.reversed).toBe(1);

    const second = await commissions.syncNow();
    expect(second).toEqual({ ingested: 0, confirmed: 0, reversed: 0 });
  });
});
