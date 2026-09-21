import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import type Stripe from 'stripe';
import { resetDatabase, testPrisma } from './utils/db';
import {
  seedAttributionAttempt,
  seedAffiliateProgram,
  seedCommissionEvent,
  seedDevice,
  seedKiosk,
  seedLocation,
  seedMerchant,
} from './utils/fixtures';
import { CommissionsService } from '../src/commissions/commissions.service';
import { PayoutsService } from '../src/payouts/payouts.service';
import { DevicesService } from '../src/devices/devices.service';
import { MerchantsService } from '../src/merchants/merchants.service';
import { PublicApiService } from '../src/public-api/public-api.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { AffiliateAdapterRegistryService } from '../src/affiliate-adapters/affiliate-adapter-registry.service';
import { StripeService } from '../src/stripe/stripe.service';
import { NotificationTriggersService } from '../src/notifications/notification-triggers.service';
import { saveAutomatedCoupon } from '../src/coupons/automated-coupon.util';
import {
  deleteKioskCascade,
  deleteLocationsCascade,
  deleteMerchantCascade,
} from '../src/common/prisma/cascade-delete.util';

// Real PostgreSQL transactions/constraints; no app boot, Redis workers or external APIs.
describe('financial and sourcing reliability regressions', () => {
  const prisma = testPrisma as unknown as PrismaService;
  const notifications = {
    payoutProcessed: jest.fn().mockResolvedValue(undefined),
  } as unknown as NotificationTriggersService;
  let adapter: {
    fetchConversions: jest.Mock;
    checkConversionStatuses: jest.Mock;
    isTest: boolean;
  };
  let stripe: {
    createTransfer: jest.Mock;
    retrieveTransfer: jest.Mock;
    findTransferForPayout: jest.Mock;
  };
  let commissions: CommissionsService;
  let payouts: PayoutsService;
  beforeEach(async () => {
    await resetDatabase();
    adapter = {
      fetchConversions: jest.fn().mockResolvedValue([]),
      checkConversionStatuses: jest.fn().mockResolvedValue([]),
      isTest: false,
    };
    stripe = {
      createTransfer: jest.fn(),
      retrieveTransfer: jest.fn(),
      findTransferForPayout: jest.fn().mockResolvedValue(null),
    };
    commissions = new CommissionsService(
      prisma,
      {
        requireAdapter: () => adapter,
      } as unknown as AffiliateAdapterRegistryService,
      { get: () => 90 } as unknown as ConfigService,
      notifications,
    );
    payouts = new PayoutsService(
      prisma,
      stripe as unknown as StripeService,
      notifications,
    );
    jest.mocked(notifications.payoutProcessed).mockClear();
  });
  afterAll(async () => {
    await testPrisma.$disconnect();
  });

  async function fixture() {
    const kiosk = await seedKiosk({ revenueSharePct: 50 });
    await testPrisma.kiosk.update({
      where: { id: kiosk.id },
      data: { stripeAccountId: 'acct_test' },
    });
    const location = await seedLocation(kiosk.id);
    const device = await seedDevice(location.id);
    const program = await seedAffiliateProgram();
    const merchant = await seedMerchant({
      affiliateProgramId: program.id,
      affiliateSubIdParamKey: 'SID',
    });
    return { kiosk, location, device, merchant };
  }
  const transfer = (id: string, payoutId: string, amount = 1000) =>
    ({
      id,
      amount,
      currency: 'usd',
      destination: 'acct_test',
      metadata: { payoutId },
      reversed: false,
      amount_reversed: 0,
    }) as unknown as Stripe.Transfer;
  async function payable() {
    const f = await fixture();
    const event = await seedCommissionEvent(f.device.id, f.merchant.id, {
      status: 'CONFIRMED',
      kioskShareAmount: 10,
    });
    await payouts.generatePayouts();
    const payout = await testPrisma.payout.findFirstOrThrow();
    return { ...f, event, payout };
  }

  it('retains earnings and attribution after device retirement, and blocks deleting their parents', async () => {
    const f = await payable();
    await seedAttributionAttempt(f.device.id, f.merchant.id);
    await testPrisma.deviceToken.create({
      data: { deviceId: f.device.id, tokenHash: 'old-token' },
    });
    await new DevicesService(prisma).remove(f.device.id);
    expect(
      await testPrisma.device.findUnique({ where: { id: f.device.id } }),
    ).toMatchObject({ active: false, retiredAt: expect.any(Date) });
    expect(await testPrisma.deviceToken.count()).toBe(0);
    expect(await testPrisma.commissionEvent.count()).toBe(1);
    expect(await testPrisma.attributionAttempt.count()).toBe(1);
    await expect(
      testPrisma.$transaction((tx) => deleteMerchantCascade(tx, f.merchant.id)),
    ).rejects.toThrow('history');
    await expect(
      testPrisma.$transaction((tx) =>
        deleteLocationsCascade(tx, [f.location.id]),
      ),
    ).rejects.toThrow('history');
    await expect(
      testPrisma.$transaction((tx) => deleteKioskCascade(tx, f.kiosk.id)),
    ).rejects.toThrow('history');
    expect(await testPrisma.payout.count()).toBe(1);
  });

  it('ingests multiple orders per click and reports actual inserts across concurrent/repeated syncs', async () => {
    const f = await fixture();
    const click = await seedAttributionAttempt(f.device.id, f.merchant.id);
    adapter.fetchConversions.mockResolvedValue(
      ['order-a', 'order-b'].map((networkReference) => ({
        subId: click.subId,
        networkReference,
        orderValue: 100,
        commissionAmount: 20,
        status: 'pending',
        reportedAt: new Date(),
      })),
    );
    const results = await Promise.all([
      commissions.ingestNewConversions(),
      commissions.ingestNewConversions(),
    ]);
    expect(results.reduce((sum, r) => sum + r.ingested, 0)).toBe(2);
    expect(await testPrisma.commissionEvent.count()).toBe(2);
    expect(await commissions.ingestNewConversions()).toEqual({ ingested: 0 });
  });

  it('traverses later pages even when the first 500 orders stay pending', async () => {
    const f = await fixture();
    await testPrisma.commissionEvent.createMany({
      data: Array.from({ length: 501 }, (_, i) => ({
        id: `event-${String(i).padStart(4, '0')}`,
        deviceId: f.device.id,
        merchantId: f.merchant.id,
        networkReference: `order-${i}`,
        orderValue: 100,
        commissionAmount: 20,
        kioskShareAmount: 0,
        reportedAt: new Date(),
        status: 'PENDING',
      })),
    });
    adapter.checkConversionStatuses.mockImplementation(
      async (_id, refs: string[]) =>
        refs.map((networkReference) => ({
          networkReference,
          status: networkReference === 'order-500' ? 'confirmed' : 'pending',
        })),
    );
    expect(await commissions.reconcilePendingConversions()).toEqual({
      confirmed: 1,
      reversed: 0,
    });
    expect(adapter.checkConversionStatuses).toHaveBeenCalledTimes(2);
    expect(
      (
        await testPrisma.commissionEvent.findUniqueOrThrow({
          where: { id: 'event-0500' },
        })
      ).kioskShareAmount.toNumber(),
    ).toBe(10);
  }, 60000);

  it('deducts a reversal before transfer and never transfers a zero payout', async () => {
    const f = await payable();
    adapter.checkConversionStatuses.mockResolvedValue([
      { networkReference: f.event.networkReference, status: 'reversed' },
    ]);
    await commissions.reconcilePendingConversions();
    const stored = await testPrisma.payout.findUniqueOrThrow({
      where: { id: f.payout.id },
    });
    expect(stored.totalAmount.toNumber()).toBe(0);
    expect(await testPrisma.commissionAdjustment.count()).toBe(0);
    await expect(payouts.processPayout(f.payout.id)).rejects.toThrow();
    expect(stripe.createTransfer).not.toHaveBeenCalled();
  });

  it('recovers a paid reversal once from future earnings without changing the old transfer amount', async () => {
    const f = await payable();
    await testPrisma.payout.update({
      where: { id: f.payout.id },
      data: { status: 'PAID', stripeTransferId: 'tr_old' },
    });
    adapter.checkConversionStatuses.mockResolvedValue([
      { networkReference: f.event.networkReference, status: 'reversed' },
    ]);
    await Promise.all([
      commissions.reconcilePendingConversions(),
      commissions.reconcilePendingConversions(),
    ]);
    expect(await testPrisma.commissionAdjustment.count()).toBe(1);
    expect(
      (await commissions.getBalance(f.kiosk.id)).confirmedAvailableAmount,
    ).toBe(-10);
    expect(
      (
        await testPrisma.payout.findUniqueOrThrow({
          where: { id: f.payout.id },
        })
      ).totalAmount.toNumber(),
    ).toBe(10);
    await seedCommissionEvent(f.device.id, f.merchant.id, {
      status: 'CONFIRMED',
      kioskShareAmount: 15,
    });
    const results = await Promise.all([
      payouts.generatePayouts(),
      payouts.generatePayouts(),
    ]);
    expect(results.reduce((sum, r) => sum + r.payoutsCreated, 0)).toBe(1);
    const next = await testPrisma.payout.findFirstOrThrow({
      where: { status: 'PENDING' },
    });
    expect(next.totalAmount.toNumber()).toBe(5);
    expect(
      (await testPrisma.commissionAdjustment.findFirstOrThrow()).payoutId,
    ).toBe(next.id);
  });

  it('excludes mock earnings from payable balances and payout generation', async () => {
    const f = await fixture();
    const event = await seedCommissionEvent(f.device.id, f.merchant.id, {
      status: 'CONFIRMED',
      kioskShareAmount: 10,
    });
    await testPrisma.commissionEvent.update({
      where: { id: event.id },
      data: { isTest: true },
    });
    expect(await payouts.generatePayouts()).toEqual({ payoutsCreated: 0 });
    expect(
      (await commissions.getBalance(f.kiosk.id)).confirmedAvailableAmount,
    ).toBe(0);
  });

  it('deducts newly recorded debt from a payout that was already generated', async () => {
    const f = await payable();
    await testPrisma.payout.update({
      where: { id: f.payout.id },
      data: { status: 'PAID' },
    });
    await seedCommissionEvent(f.device.id, f.merchant.id, {
      status: 'CONFIRMED',
      kioskShareAmount: 15,
    });
    await payouts.generatePayouts();
    const pending = await testPrisma.payout.findFirstOrThrow({
      where: { status: 'PENDING' },
    });
    adapter.checkConversionStatuses.mockResolvedValue([
      { networkReference: f.event.networkReference, status: 'reversed' },
    ]);
    await commissions.reconcilePendingConversions();
    stripe.createTransfer.mockResolvedValue(
      transfer('tr_net', pending.id, 500),
    );
    expect(await payouts.processPayout(pending.id)).toMatchObject({
      status: 'PAID',
      totalAmount: 5,
    });
    expect(stripe.createTransfer).toHaveBeenCalledWith(
      'acct_test',
      new Prisma.Decimal(5),
      pending.id,
    );
  });

  it('deduplicates concurrent observations of the same scraped coupon', async () => {
    const f = await fixture();
    await Promise.all(
      Array.from({ length: 3 }, () =>
        saveAutomatedCoupon(
          prisma,
          f.merchant.id,
          { code: 'SAME10' },
          'SCRAPE',
        ),
      ),
    );
    expect(await testPrisma.coupon.count()).toBe(1);
  });

  it('matches an early webhook by payout metadata before the transfer ID is saved', async () => {
    const f = await payable();
    const result = transfer('tr_early', f.payout.id);
    stripe.retrieveTransfer.mockResolvedValue(result);
    stripe.createTransfer.mockImplementation(async () => {
      await payouts.handleStripeWebhookEvent({
        type: 'transfer.created',
        data: { object: result },
      } as Stripe.Event);
      return result;
    });
    expect(await payouts.processPayout(f.payout.id)).toMatchObject({
      status: 'PAID',
      stripeTransferId: 'tr_early',
    });
  });

  it('recovers a crash after Stripe accepted the transfer without creating a second transfer', async () => {
    const f = await payable();
    await testPrisma.payout.update({
      where: { id: f.payout.id },
      data: {
        status: 'PROCESSING',
        transferStartedAt: new Date(),
        transferDestination: 'acct_test',
      },
    });
    stripe.findTransferForPayout.mockResolvedValue(
      transfer('tr_recovered', f.payout.id),
    );
    expect(await payouts.recoverPayout(f.payout.id)).toMatchObject({
      status: 'PAID',
      stripeTransferId: 'tr_recovered',
    });
    expect(stripe.createTransfer).not.toHaveBeenCalled();
  });

  it('retains an ambiguous transfer claim and retries with its frozen destination', async () => {
    const f = await payable();
    stripe.createTransfer.mockRejectedValueOnce(new Error('Timeout'));
    await expect(payouts.processPayout(f.payout.id)).rejects.toThrow('Timeout');
    expect(
      (
        await testPrisma.payout.findUniqueOrThrow({
          where: { id: f.payout.id },
        })
      ).status,
    ).toBe('PROCESSING');
    await testPrisma.kiosk.update({
      where: { id: f.kiosk.id },
      data: { stripeAccountId: 'acct_changed' },
    });
    stripe.createTransfer.mockResolvedValue(transfer('tr_retry', f.payout.id));
    await payouts.recoverPayout(f.payout.id);
    expect(stripe.createTransfer).toHaveBeenLastCalledWith(
      'acct_test',
      new Prisma.Decimal(10),
      f.payout.id,
    );
  });

  it('never creates a transfer outside the safe idempotency retry window', async () => {
    const f = await payable();
    await testPrisma.payout.update({
      where: { id: f.payout.id },
      data: {
        status: 'PROCESSING',
        transferStartedAt: new Date(Date.now() - 86400_000),
        transferDestination: 'acct_test',
      },
    });
    await expect(payouts.recoverPayout(f.payout.id)).rejects.toThrow(
      'manual Stripe reconciliation',
    );
    expect(stripe.createTransfer).not.toHaveBeenCalled();
  });

  it('preserves disabled/manual coupons, refreshes renewed scraped offers, and excludes stale codes', async () => {
    const f = await fixture();
    const disabled = await testPrisma.coupon.create({
      data: {
        merchantId: f.merchant.id,
        code: 'DISABLED',
        source: 'SCRAPE',
        active: false,
      },
    });
    const manual = await testPrisma.coupon.create({
      data: {
        merchantId: f.merchant.id,
        code: 'MANUAL',
        source: 'MANUAL',
        description: 'Curated',
      },
    });
    await saveAutomatedCoupon(
      prisma,
      f.merchant.id,
      { code: 'DISABLED' },
      'SCRAPE',
    );
    await saveAutomatedCoupon(
      prisma,
      f.merchant.id,
      { code: 'MANUAL', description: 'Overwrite' },
      'API',
    );
    expect(
      (
        await testPrisma.coupon.findUniqueOrThrow({
          where: { id: disabled.id },
        })
      ).active,
    ).toBe(false);
    expect(
      await testPrisma.coupon.findUniqueOrThrow({ where: { id: manual.id } }),
    ).toMatchObject({ source: 'MANUAL', description: 'Curated' });
    const renewed = await testPrisma.coupon.create({
      data: {
        merchantId: f.merchant.id,
        code: 'RENEWED',
        source: 'SCRAPE',
        expiresAt: new Date(0),
        freshUntil: new Date(0),
      },
    });
    await saveAutomatedCoupon(
      prisma,
      f.merchant.id,
      { code: renewed.code },
      'SCRAPE',
    );
    expect(
      (await testPrisma.coupon.findUniqueOrThrow({ where: { id: renewed.id } }))
        .expiresAt,
    ).toBeNull();
    await testPrisma.coupon.create({
      data: {
        merchantId: f.merchant.id,
        code: 'STALE',
        source: 'SCRAPE',
        freshUntil: new Date(0),
      },
    });
    const published = await new PublicApiService(prisma).getMerchantByDomain(
      f.merchant.domain,
    );
    expect(published.coupons.map((c) => c.code).sort()).toEqual([
      'MANUAL',
      'RENEWED',
    ]);
  });

  it('saves and updates the merchant sub-ID configuration', async () => {
    const service = new MerchantsService(prisma);
    const merchant = await service.create({
      name: 'Shop',
      domain: 'subid.test',
      attributionMethod: 'COOKIE',
      affiliateTrackingUrl: 'https://track.test',
      affiliateSubIdParamKey: 'SID',
    });
    expect(merchant.affiliateSubIdParamKey).toBe('SID');
    expect(
      (await service.update(merchant.id, { affiliateSubIdParamKey: 'SubId1' }))
        .affiliateSubIdParamKey,
    ).toBe('SubId1');
    expect(
      (await service.update(merchant.id, { affiliateSubIdParamKey: null }))
        .affiliateSubIdParamKey,
    ).toBeNull();
  });
});
