import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CommissionEvent,
  CommissionStatus,
  Prisma,
  UserRole,
} from '@prisma/client';
import { AffiliateAdapterRegistryService } from '../affiliate-adapters/affiliate-adapter-registry.service';
import { groupBy } from '../common/collections/group-by.util';
import { parsePositiveIntEnv } from '../common/config/positive-int-env.util';
import { NotificationTriggersService } from '../notifications/notification-triggers.service';
import { serializable } from '../common/prisma/serializable.util';
import { PrismaService } from '../prisma/prisma.service';
import { BalanceDto } from './dto/balance.dto';
import { CommissionEventDto } from './dto/commission-event.dto';
import { CommissionEventFilterDto } from './dto/commission-event-filter.dto';

const DIGEST_WINDOW_MS = 24 * 60 * 60 * 1000;
const DIGEST_PERIOD_LABEL = '24 hours';

const DEFAULT_PENDING_WINDOW_DAYS = 90;
// Bound each query; cursor pagination still visits every eligible event in this pass.
const RECONCILIATION_PAGE_SIZE = 500;

type CandidateAttempt = Prisma.AttributionAttemptGetPayload<{
  include: {
    merchant: { include: { affiliateProgram: true } };
    device: { include: { location: { include: { kiosk: true } } } };
  };
}>;

@Injectable()
export class CommissionsService {
  private readonly logger = new Logger(CommissionsService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly adapterRegistry: AffiliateAdapterRegistryService,
    private readonly configService: ConfigService,
    private readonly notificationTriggers: NotificationTriggersService,
  ) {}

  /**
   * Runs both halves of the commission sync: ingest brand-new conversions for
   * recent attribution attempts, then re-check pending and confirmed events for reversals.
   * Used by both the scheduled job and the admin-triggered manual sync endpoint.
   */
  async syncNow(): Promise<{
    ingested: number;
    confirmed: number;
    reversed: number;
  }> {
    let ingested = 0;
    let ingestionError: unknown;
    try {
      ({ ingested } = await this.ingestNewConversions());
    } catch (error) {
      ingestionError = error;
    }
    const { confirmed, reversed } = await this.reconcilePendingConversions();
    if (ingestionError) throw ingestionError;
    return { ingested, confirmed, reversed };
  }

  /**
   * Matches recent AttributionAttempts (including clicks with earlier orders) against each network's reported
   * conversions and creates a CommissionEvent (PENDING, or immediately CONFIRMED/REVERSED
   * if the network already reports a final status) for each one found.
   */
  async ingestNewConversions(): Promise<{ ingested: number }> {
    const windowDays = parsePositiveIntEnv(
      this.configService.get('COMMISSION_PENDING_WINDOW_DAYS'),
      DEFAULT_PENDING_WINDOW_DAYS,
    );
    const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

    let cursor: string | undefined;
    let ingested = 0;
    const failures = new Set<string>();
    for (;;) {
      // Revisit clicks with existing orders: a single click can generate multiple sales.
      const candidates = await this.prisma.attributionAttempt.findMany({
        where: { createdAt: { gte: since } },
        include: {
          merchant: { include: { affiliateProgram: true } },
          device: { include: { location: { include: { kiosk: true } } } },
        },
        orderBy: { id: 'asc' },
        take: RECONCILIATION_PAGE_SIZE,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      if (!candidates.length) break;
      cursor = candidates[candidates.length - 1].id;
      const byProgram = groupBy(
        candidates.filter((c) => c.merchant.affiliateProgram),
        (c) => c.merchant.affiliateProgramId!,
      );
      for (const [programId, attempts] of byProgram) {
        try {
          const adapter = this.adapterRegistry.requireAdapter(
            attempts[0].merchant.affiliateProgram!.networkName,
          );
          if (!adapter.fetchConversions)
            throw new Error('Adapter does not support conversions');
          const bySubId = new Map(attempts.map((a) => [a.subId, a]));
          for (const conversion of await adapter.fetchConversions(programId, [
            ...bySubId.keys(),
          ])) {
            const attempt = bySubId.get(conversion.subId);
            if (attempt)
              ingested += await this.createCommissionEvent(
                attempt,
                conversion,
                adapter.isTest === true,
              );
          }
        } catch (error) {
          this.logger.error(
            'Conversion ingestion failed for program ' + programId,
            error,
          );
          failures.add(programId);
        }
      }
    }
    if (failures.size)
      throw new Error(
        'Conversion ingestion failed for programs: ' + [...failures].join(', '),
      );
    return { ingested };
  }

  private async createCommissionEvent(
    attempt: CandidateAttempt,
    conversion: {
      subId: string;
      networkReference: string;
      orderValue: number;
      commissionAmount: number;
      status: 'pending' | 'confirmed' | 'reversed';
      reportedAt: Date;
    },
    isTest: boolean,
  ): Promise<number> {
    if (
      !conversion.networkReference ||
      !Number.isFinite(conversion.orderValue) ||
      conversion.orderValue < 0 ||
      !Number.isFinite(conversion.commissionAmount) ||
      conversion.commissionAmount < 0 ||
      !['pending', 'confirmed', 'reversed'].includes(conversion.status) ||
      !Number.isFinite(conversion.reportedAt?.getTime())
    ) {
      throw new Error('Invalid network conversion');
    }
    const kioskShareAmount =
      conversion.status === 'confirmed'
        ? new Prisma.Decimal(conversion.commissionAmount)
            .mul(attempt.device.location.kiosk.revenueSharePct)
            .div(100)
        : new Prisma.Decimal(0);
    // Actual insert count, deduplicated by merchant + network order, including concurrent runs.
    const result = await this.prisma.commissionEvent.createMany({
      skipDuplicates: true,
      data: [
        {
          deviceId: attempt.deviceId,
          merchantId: attempt.merchantId,
          subId: attempt.subId,
          networkReference: conversion.networkReference,
          orderValue: conversion.orderValue,
          commissionAmount: conversion.commissionAmount,
          kioskShareAmount,
          isTest,
          status: toCommissionStatus(conversion.status),
          reportedAt: conversion.reportedAt,
          confirmedAt: conversion.status === 'confirmed' ? new Date() : null,
          reversedAt: conversion.status === 'reversed' ? new Date() : null,
        },
      ],
    });
    return result.count;
  }

  async reconcilePendingConversions(): Promise<{
    confirmed: number;
    reversed: number;
  }> {
    let confirmed = 0,
      reversed = 0;
    const failures = new Set<string>();
    let cursor: string | undefined;
    for (;;) {
      // Cursor all pages, including confirmed orders that may subsequently be reversed.
      const events = await this.prisma.commissionEvent.findMany({
        where: {
          status: {
            in: [CommissionStatus.PENDING, CommissionStatus.CONFIRMED],
          },
        },
        include: {
          merchant: { include: { affiliateProgram: true } },
          device: { include: { location: { include: { kiosk: true } } } },
        },
        orderBy: { id: 'asc' },
        take: RECONCILIATION_PAGE_SIZE,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      if (!events.length) break;
      cursor = events[events.length - 1].id;
      const byProgram = groupBy(
        events.filter((e) => e.merchant.affiliateProgram),
        (e) => e.merchant.affiliateProgramId!,
      );
      for (const [programId, batch] of byProgram) {
        try {
          const adapter = this.adapterRegistry.requireAdapter(
            batch[0].merchant.affiliateProgram!.networkName,
          );
          if (!adapter.checkConversionStatuses)
            throw new Error('Adapter does not support reconciliation');
          const results = await adapter.checkConversionStatuses(
            programId,
            batch.map((e) => e.networkReference),
          );
          const statuses = new Map(
            results.map((r) => [r.networkReference, r.status]),
          );
          for (const event of batch) {
            const changed = await this.reconcileEvent(
              event.id,
              statuses.get(event.networkReference),
            );
            if (changed === 'confirmed') confirmed++;
            if (changed === 'reversed') reversed++;
          }
        } catch (error) {
          this.logger.error(
            'Reconciliation failed for program ' + programId,
            error,
          );
          failures.add(programId);
        }
      }
    }
    if (failures.size)
      throw new Error(
        'Reconciliation failed for programs: ' + [...failures].join(', '),
      );
    return { confirmed, reversed };
  }

  private async reconcileEvent(
    id: string,
    status?: string,
  ): Promise<string | null> {
    return serializable(this.prisma, async (tx) => {
      const event = await tx.commissionEvent.findUniqueOrThrow({
        where: { id },
        include: {
          payout: true,
          device: { include: { location: { include: { kiosk: true } } } },
        },
      });
      if (event.status === CommissionStatus.REVERSED) return null;
      const checked = { lastReconciledAt: new Date() };
      if (status === 'confirmed' && event.status === CommissionStatus.PENDING) {
        await tx.commissionEvent.update({
          where: { id },
          data: {
            ...checked,
            status: CommissionStatus.CONFIRMED,
            confirmedAt: new Date(),
            kioskShareAmount: event.commissionAmount
              .mul(event.device.location.kiosk.revenueSharePct)
              .div(100),
          },
        });
        return 'confirmed';
      }
      if (status === 'reversed') {
        let payoutId = event.payoutId;
        if (event.payout?.status === 'PENDING') {
          const reduced = await tx.payout.update({
            where: { id: event.payout.id },
            data: { totalAmount: { decrement: event.kioskShareAmount } },
          });
          if (!reduced.totalAmount.greaterThan(0)) {
            // A reversal can consume all earnings that were covering earlier debt. Carry
            // both the remaining earnings and deductions into a future positive payout.
            await tx.commissionEvent.updateMany({
              where: { payoutId: reduced.id },
              data: { payoutId: null },
            });
            await tx.commissionAdjustment.updateMany({
              where: { payoutId: reduced.id },
              data: { payoutId: null },
            });
            await tx.payout.update({
              where: { id: reduced.id },
              data: { totalAmount: 0, status: 'FAILED' },
            });
          }
          payoutId = null;
        } else if (event.payout && event.kioskShareAmount.greaterThan(0)) {
          await tx.commissionAdjustment.upsert({
            where: { commissionEventId: id },
            update: {},
            create: {
              commissionEventId: id,
              kioskId: event.payout.kioskId,
              amount: event.kioskShareAmount.negated(),
            },
          });
        }
        await tx.commissionEvent.update({
          where: { id },
          data: {
            ...checked,
            status: CommissionStatus.REVERSED,
            reversedAt: new Date(),
            kioskShareAmount: 0,
            payoutId,
          },
        });
        return 'reversed';
      }
      await tx.commissionEvent.update({ where: { id }, data: checked });
      return null;
    });
  }

  /**
   * Sends each kiosk-owner a summary of commission events confirmed/reversed in the last
   * 24h. Only queries confirmedAt/reversedAt (not reportedAt. FindAllForAdmin's date
   * filter is on the wrong field for this) and skips kiosks with nothing to report, so no
   * empty digest email goes out on a quiet day.
   */
  async sendDailyDigests(): Promise<void> {
    const since = new Date(Date.now() - DIGEST_WINDOW_MS);
    const events = await this.prisma.commissionEvent.findMany({
      where: {
        OR: [{ confirmedAt: { gte: since } }, { reversedAt: { gte: since } }],
      },
      include: {
        device: { select: { location: { select: { kioskId: true } } } },
      },
    });
    if (events.length === 0) {
      return;
    }

    const byKioskId = groupBy(events, (e) => e.device.location.kioskId);
    for (const [kioskId, kioskEvents] of byKioskId) {
      const kiosk = await this.prisma.kiosk.findUnique({
        where: { id: kioskId },
        include: { users: { where: { role: UserRole.KIOSK_OWNER }, take: 1 } },
      });
      const owner = kiosk?.users[0];
      if (!owner) {
        continue;
      }

      const confirmed = kioskEvents.filter(
        (e) => e.status === CommissionStatus.CONFIRMED,
      );
      const reversed = kioskEvents.filter(
        (e) => e.status === CommissionStatus.REVERSED,
      );
      const confirmedTotal = confirmed.reduce(
        (sum, e) => sum.add(e.kioskShareAmount),
        new Prisma.Decimal(0),
      );
      // kioskShareAmount is zeroed on reversal by design (never payable. See
      // reconcilePendingConversions), so the digest recomputes what the share would have been
      // from the still-intact commissionAmount, purely for reporting.
      const reversedTotal = reversed.reduce(
        (sum, e) =>
          sum.add(e.commissionAmount.mul(kiosk.revenueSharePct).div(100)),
        new Prisma.Decimal(0),
      );

      await this.notificationTriggers.commissionDigest(owner, kiosk.name, {
        periodLabel: DIGEST_PERIOD_LABEL,
        confirmedTotal: confirmedTotal.toNumber(),
        confirmedCount: confirmed.length,
        reversedTotal: reversedTotal.toNumber(),
        reversedCount: reversed.length,
      });
    }
  }

  /** Admin view. Every kiosk's commission events, filterable. */
  async findAllForAdmin(
    filter: CommissionEventFilterDto,
  ): Promise<CommissionEventDto[]> {
    const events = await this.prisma.commissionEvent.findMany({
      where: {
        merchantId: filter.merchantId,
        status: filter.status,
        device: {
          locationId: filter.locationId,
          location: filter.kioskId ? { kioskId: filter.kioskId } : undefined,
        },
        reportedAt: {
          gte: filter.dateFrom ? new Date(filter.dateFrom) : undefined,
          lte: filter.dateTo ? new Date(filter.dateTo) : undefined,
        },
      },
      orderBy: { reportedAt: 'desc' },
      // Safety cap, not real pagination -- see merchants.service.ts's findAll for the general
      // reasoning. Higher than the catalog-entity caps since this is an ever-growing event
      // log; callers with more to see already have real filters (merchantId/status/
      // locationId/kioskId/date range) to narrow the unfiltered default down.
      take: 2000,
    });
    return events.map(toCommissionEventDto);
  }

  /** Kiosk-owner view. Only their own kiosk's commission events, never another's. */
  async findAllForKiosk(kioskId: string): Promise<CommissionEventDto[]> {
    const events = await this.prisma.commissionEvent.findMany({
      where: { device: { location: { kioskId } } },
      orderBy: { reportedAt: 'desc' },
    });
    return events.map(toCommissionEventDto);
  }

  async getBalance(kioskId: string): Promise<BalanceDto> {
    const kiosk = await this.prisma.kiosk.findUnique({
      where: { id: kioskId },
      select: { revenueSharePct: true },
    });
    if (!kiosk) {
      throw new NotFoundException('Kiosk not found');
    }

    const [pendingAgg, confirmedAgg, adjustments] = await Promise.all([
      this.prisma.commissionEvent.aggregate({
        where: {
          status: CommissionStatus.PENDING,
          isTest: false,
          device: { location: { kioskId } },
        },
        _sum: { commissionAmount: true },
      }),
      this.prisma.commissionEvent.aggregate({
        // payoutId: null. CONFIRMED events already swept into a Payout are no longer "available".
        where: {
          status: CommissionStatus.CONFIRMED,
          isTest: false,
          device: { location: { kioskId } },
          payoutId: null,
        },
        _sum: { kioskShareAmount: true },
      }),
      this.prisma.commissionAdjustment.aggregate({
        where: { kioskId, payoutId: null },
        _sum: { amount: true },
      }),
    ]);

    const pendingCommissionTotal =
      pendingAgg._sum.commissionAmount ?? new Prisma.Decimal(0);
    const pendingAmount = pendingCommissionTotal
      .mul(kiosk.revenueSharePct)
      .div(100);
    const confirmedAvailableAmount =
      confirmedAgg._sum.kioskShareAmount ?? new Prisma.Decimal(0);

    return {
      pendingAmount: pendingAmount.toNumber(),
      confirmedAvailableAmount: confirmedAvailableAmount
        .add(adjustments._sum.amount ?? 0)
        .toNumber(),
    };
  }
}

function toCommissionEventDto(event: CommissionEvent): CommissionEventDto {
  return {
    id: event.id,
    deviceId: event.deviceId,
    merchantId: event.merchantId,
    couponId: event.couponId,
    networkReference: event.networkReference,
    orderValue: event.orderValue.toNumber(),
    commissionAmount: event.commissionAmount.toNumber(),
    kioskShareAmount: event.kioskShareAmount.toNumber(),
    status: event.status,
    reportedAt: event.reportedAt,
    confirmedAt: event.confirmedAt,
    reversedAt: event.reversedAt,
    payoutId: event.payoutId,
  };
}

function toCommissionStatus(
  status: 'pending' | 'confirmed' | 'reversed',
): CommissionStatus {
  switch (status) {
    case 'confirmed':
      return CommissionStatus.CONFIRMED;
    case 'reversed':
      return CommissionStatus.REVERSED;
    default:
      return CommissionStatus.PENDING;
  }
}
