import { INestApplication } from '@nestjs/common';
import { CommissionStatus } from '@prisma/client';
import { PayoutsService } from '../src/payouts/payouts.service';
import { resetDatabase, testPrisma } from './utils/db';
import { seedCommissionEvent, seedDevice, seedKiosk, seedLocation, seedMerchant } from './utils/fixtures';
import { createTestApp } from './utils/test-app';

describe('Payout aggregation (e2e, real DB) — confirmed-only invariant', () => {
  let app: INestApplication;
  let payouts: PayoutsService;

  beforeAll(async () => {
    app = await createTestApp();
    payouts = app.get(PayoutsService);
  });

  afterAll(async () => {
    await app.close();
    await testPrisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  async function seedKioskWithDevice() {
    const kiosk = await seedKiosk({ revenueSharePct: 30 });
    const location = await seedLocation(kiosk.id);
    const device = await seedDevice(location.id);
    const merchant = await seedMerchant();
    return { kiosk, device, merchant };
  }

  it('aggregates CONFIRMED events into a new Payout and marks them as swept', async () => {
    const { kiosk, device, merchant } = await seedKioskWithDevice();
    const eventA = await seedCommissionEvent(device.id, merchant.id, { status: CommissionStatus.CONFIRMED, kioskShareAmount: 1.5 });
    const eventB = await seedCommissionEvent(device.id, merchant.id, { status: CommissionStatus.CONFIRMED, kioskShareAmount: 2.25 });

    const result = await payouts.generatePayouts();
    expect(result.payoutsCreated).toBe(1);

    const payout = await testPrisma.payout.findFirstOrThrow({ where: { kioskId: kiosk.id } });
    expect(payout.totalAmount.toString()).toBe('3.75');
    expect(payout.status).toBe('pending');

    const refreshedA = await testPrisma.commissionEvent.findUniqueOrThrow({ where: { id: eventA.id } });
    const refreshedB = await testPrisma.commissionEvent.findUniqueOrThrow({ where: { id: eventB.id } });
    expect(refreshedA.payoutId).toBe(payout.id);
    expect(refreshedB.payoutId).toBe(payout.id);
  });

  it('never includes a PENDING event in a payout, under any code path', async () => {
    const { device, merchant } = await seedKioskWithDevice();
    await seedCommissionEvent(device.id, merchant.id, { status: CommissionStatus.PENDING, kioskShareAmount: 0 });

    const result = await payouts.generatePayouts();

    expect(result.payoutsCreated).toBe(0);
    expect(await testPrisma.payout.count()).toBe(0);
  });

  it('never includes a REVERSED event in a payout, under any code path', async () => {
    const { device, merchant } = await seedKioskWithDevice();
    await seedCommissionEvent(device.id, merchant.id, { status: CommissionStatus.REVERSED, kioskShareAmount: 0 });

    const result = await payouts.generatePayouts();

    expect(result.payoutsCreated).toBe(0);
    expect(await testPrisma.payout.count()).toBe(0);
  });

  it('aggregates only the CONFIRMED events from a mix of PENDING/CONFIRMED/REVERSED for the same kiosk', async () => {
    const { kiosk, device, merchant } = await seedKioskWithDevice();
    await seedCommissionEvent(device.id, merchant.id, { status: CommissionStatus.PENDING, kioskShareAmount: 0 });
    await seedCommissionEvent(device.id, merchant.id, { status: CommissionStatus.REVERSED, kioskShareAmount: 0 });
    await seedCommissionEvent(device.id, merchant.id, { status: CommissionStatus.CONFIRMED, kioskShareAmount: 4 });

    await payouts.generatePayouts();

    const payout = await testPrisma.payout.findFirstOrThrow({ where: { kioskId: kiosk.id } });
    expect(payout.totalAmount.toString()).toBe('4');

    const sweptCount = await testPrisma.commissionEvent.count({ where: { payoutId: payout.id } });
    expect(sweptCount).toBe(1);
  });

  it('does not double-count an already-swept CONFIRMED event on a repeat run', async () => {
    const { device, merchant } = await seedKioskWithDevice();
    await seedCommissionEvent(device.id, merchant.id, { status: CommissionStatus.CONFIRMED, kioskShareAmount: 5 });

    const first = await payouts.generatePayouts();
    const second = await payouts.generatePayouts();

    expect(first.payoutsCreated).toBe(1);
    expect(second.payoutsCreated).toBe(0);
    expect(await testPrisma.payout.count()).toBe(1);
  });

  it('creates a separate Payout per kiosk, never merging across tenants', async () => {
    const scenarioA = await seedKioskWithDevice();
    const scenarioB = await seedKioskWithDevice();
    await seedCommissionEvent(scenarioA.device.id, scenarioA.merchant.id, { status: CommissionStatus.CONFIRMED, kioskShareAmount: 1 });
    await seedCommissionEvent(scenarioB.device.id, scenarioB.merchant.id, { status: CommissionStatus.CONFIRMED, kioskShareAmount: 2 });

    const result = await payouts.generatePayouts();

    expect(result.payoutsCreated).toBe(2);
    const payoutA = await testPrisma.payout.findFirstOrThrow({ where: { kioskId: scenarioA.kiosk.id } });
    const payoutB = await testPrisma.payout.findFirstOrThrow({ where: { kioskId: scenarioB.kiosk.id } });
    expect(payoutA.totalAmount.toString()).toBe('1');
    expect(payoutB.totalAmount.toString()).toBe('2');
  });

  it('a second run only sweeps newly-confirmed events, chaining periodStart from the prior payout\'s periodEnd', async () => {
    const { kiosk, device, merchant } = await seedKioskWithDevice();
    await seedCommissionEvent(device.id, merchant.id, { status: CommissionStatus.CONFIRMED, kioskShareAmount: 1 });
    await payouts.generatePayouts();
    const firstPayout = await testPrisma.payout.findFirstOrThrow({ where: { kioskId: kiosk.id } });

    await seedCommissionEvent(device.id, merchant.id, { status: CommissionStatus.CONFIRMED, kioskShareAmount: 3 });
    await payouts.generatePayouts();

    const allPayouts = await testPrisma.payout.findMany({ where: { kioskId: kiosk.id }, orderBy: { createdAt: 'asc' } });
    expect(allPayouts).toHaveLength(2);
    expect(allPayouts[1].totalAmount.toString()).toBe('3');
    expect(allPayouts[1].periodStart.getTime()).toBe(firstPayout.periodEnd.getTime());
  });
});
