import { Injectable, NotFoundException } from '@nestjs/common';
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
import { PrismaService } from '../prisma/prisma.service';
import { BalanceDto } from './dto/balance.dto';
import { CommissionEventDto } from './dto/commission-event.dto';
import { CommissionEventFilterDto } from './dto/commission-event-filter.dto';

const DIGEST_WINDOW_MS = 24 * 60 * 60 * 1000;
const DIGEST_PERIOD_LABEL = '24 hours';

const DEFAULT_PENDING_WINDOW_DAYS = 90;
// Bounds each reconciliation pass so a large PENDING backlog can't load unbounded rows
// into memory in one query. Subsequent scheduled runs pick up whatever's left.
const RECONCILIATION_PAGE_SIZE = 500;

type CandidateAttempt = Prisma.AttributionAttemptGetPayload<{
  include: {
    merchant: { include: { affiliateProgram: true } };
    device: { include: { location: { include: { kiosk: true } } } };
  };
}>;

type PendingEvent = Prisma.CommissionEventGetPayload<{
  include: {
    merchant: { include: { affiliateProgram: true } };
    device: { include: { location: { include: { kiosk: true } } } };
  };
}>;

@Injectable()
export class CommissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly adapterRegistry: AffiliateAdapterRegistryService,
    private readonly configService: ConfigService,
    private readonly notificationTriggers: NotificationTriggersService,
  ) {}

  /**
   * Runs both halves of the commission sync: ingest brand-new conversions for
   * recent attribution attempts, then re-check every still-PENDING event's status.
   * Used by both the scheduled job and the admin-triggered manual sync endpoint.
   */
  async syncNow(): Promise<{
    ingested: number;
    confirmed: number;
    reversed: number;
  }> {
    const { ingested } = await this.ingestNewConversions();
    const { confirmed, reversed } = await this.reconcilePendingConversions();
    return { ingested, confirmed, reversed };
  }

  /**
   * Matches recent, not-yet-ingested AttributionAttempts against each network's reported
   * conversions and creates a CommissionEvent (PENDING, or immediately CONFIRMED/REVERSED
   * if the network already reports a final status) for each one found.
   */
  async ingestNewConversions(): Promise<{ ingested: number }> {
    const windowDays = parsePositiveIntEnv(
      this.configService.get('COMMISSION_PENDING_WINDOW_DAYS'),
      DEFAULT_PENDING_WINDOW_DAYS,
    );
    const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

    const candidates = await this.prisma.attributionAttempt.findMany({
      where: { createdAt: { gte: since }, commissionEvent: null },
      include: {
        merchant: { include: { affiliateProgram: true } },
        device: { include: { location: { include: { kiosk: true } } } },
      },
    });

    const byProgramId = groupBy(
      candidates.filter(
        (c) => c.merchant.affiliateProgramId && c.merchant.affiliateProgram,
      ),
      (c) => c.merchant.affiliateProgramId as string,
    );

    let ingested = 0;
    for (const [programId, attempts] of byProgramId) {
      const program = attempts[0].merchant.affiliateProgram!;
      const adapter = this.adapterRegistry.getAdapter(program.networkName);
      if (!adapter?.fetchConversions) {
        continue;
      }

      const attemptsBySubId = new Map(attempts.map((a) => [a.subId, a]));
      const conversions = await adapter.fetchConversions(programId, [
        ...attemptsBySubId.keys(),
      ]);

      for (const conversion of conversions) {
        const attempt = attemptsBySubId.get(conversion.subId);
        if (!attempt) {
          continue; // adapter echoed back a sub-ID we didn't ask about. Ignore rather than guess
        }

        await this.createCommissionEvent(attempt, conversion);
        ingested++;
      }
    }

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
  ): Promise<void> {
    const kioskShareAmount =
      conversion.status === 'confirmed'
        ? new Prisma.Decimal(conversion.commissionAmount)
            .mul(attempt.device.location.kiosk.revenueSharePct)
            .div(100)
        : new Prisma.Decimal(0);

    await this.prisma.commissionEvent.upsert({
      where: { subId: attempt.subId },
      update: {}, // already ingested. Reconciliation handles status changes, not this pass
      create: {
        deviceId: attempt.deviceId,
        merchantId: attempt.merchantId,
        subId: attempt.subId,
        networkReference: conversion.networkReference,
        orderValue: conversion.orderValue,
        commissionAmount: conversion.commissionAmount,
        kioskShareAmount,
        status: toCommissionStatus(conversion.status),
        reportedAt: conversion.reportedAt,
        confirmedAt: conversion.status === 'confirmed' ? new Date() : null,
        reversedAt: conversion.status === 'reversed' ? new Date() : null,
      },
    });
  }

  /**
   * Re-checks every still-PENDING CommissionEvent against its network's current status and
   * transitions it to CONFIRMED (locking in kioskShareAmount) or REVERSED (zeroing it out).
   */
  async reconcilePendingConversions(): Promise<{
    confirmed: number;
    reversed: number;
  }> {
    const pending = await this.prisma.commissionEvent.findMany({
      where: { status: CommissionStatus.PENDING },
      include: {
        merchant: { include: { affiliateProgram: true } },
        device: { include: { location: { include: { kiosk: true } } } },
      },
      take: RECONCILIATION_PAGE_SIZE,
    });

    const byProgramId = groupBy(
      pending.filter(
        (e) => e.merchant.affiliateProgramId && e.merchant.affiliateProgram,
      ),
      (e) => e.merchant.affiliateProgramId as string,
    );

    let confirmed = 0;
    let reversed = 0;
    for (const [programId, events] of byProgramId) {
      const program = events[0].merchant.affiliateProgram!;
      const adapter = this.adapterRegistry.getAdapter(program.networkName);
      if (!adapter?.checkConversionStatuses) {
        continue;
      }

      const results = await adapter.checkConversionStatuses(
        programId,
        events.map((e) => e.networkReference),
      );
      const statusByRef = new Map(
        results.map((r) => [r.networkReference, r.status]),
      );

      const toConfirm: PendingEvent[] = [];
      const toReverseIds: string[] = [];
      for (const event of events) {
        const newStatus = statusByRef.get(event.networkReference);
        if (newStatus === 'confirmed') {
          toConfirm.push(event);
        } else if (newStatus === 'reversed') {
          toReverseIds.push(event.id);
        }
        // missing or still 'pending'. Nothing to do this pass
      }

      if (toConfirm.length > 0) {
        // kioskShareAmount differs per event (own commissionAmount * its kiosk's
        // revenueSharePct), so a single updateMany can't cover this batch, a pipelined
        // transaction still replaces N serial round-trips with one, atomically.
        await this.prisma.$transaction(
          toConfirm.map((event) =>
            this.prisma.commissionEvent.update({
              where: { id: event.id },
              data: {
                status: CommissionStatus.CONFIRMED,
                confirmedAt: new Date(),
                kioskShareAmount: event.commissionAmount
                  .mul(event.device.location.kiosk.revenueSharePct)
                  .div(100),
              },
            }),
          ),
        );
        confirmed += toConfirm.length;
      }

      if (toReverseIds.length > 0) {
        await this.prisma.commissionEvent.updateMany({
          where: { id: { in: toReverseIds } },
          data: {
            status: CommissionStatus.REVERSED,
            reversedAt: new Date(),
            kioskShareAmount: 0,
          },
        });
        reversed += toReverseIds.length;
      }
    }

    return { confirmed, reversed };
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

    const [pendingAgg, confirmedAgg] = await Promise.all([
      this.prisma.commissionEvent.aggregate({
        where: {
          status: CommissionStatus.PENDING,
          device: { location: { kioskId } },
        },
        _sum: { commissionAmount: true },
      }),
      this.prisma.commissionEvent.aggregate({
        // payoutId: null. CONFIRMED events already swept into a Payout are no longer "available".
        where: {
          status: CommissionStatus.CONFIRMED,
          device: { location: { kioskId } },
          payoutId: null,
        },
        _sum: { kioskShareAmount: true },
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
      confirmedAvailableAmount: confirmedAvailableAmount.toNumber(),
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
