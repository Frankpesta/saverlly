import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CommissionStatus, Payout, Prisma } from '@prisma/client';
import type Stripe from 'stripe';
import { groupBy } from '../common/collections/group-by.util';
import { PrismaService } from '../prisma/prisma.service';
import { StripeService } from '../stripe/stripe.service';
import { PayoutDto } from './dto/payout.dto';

@Injectable()
export class PayoutsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stripeService: StripeService,
  ) {}

  /**
   * Aggregates every kiosk's not-yet-swept CONFIRMED CommissionEvents into a new
   * Payout(status: "pending") and marks those events as belonging to it, so a later
   * run never double-counts them. Kiosks with nothing payable are skipped entirely —
   * no empty $0 Payout records. PENDING/REVERSED events are never touched here.
   */
  async generatePayouts(): Promise<{ payoutsCreated: number }> {
    const unsweptEvents = await this.prisma.commissionEvent.findMany({
      where: { status: CommissionStatus.CONFIRMED, payoutId: null },
      include: { device: { select: { location: { select: { kioskId: true } } } } },
    });

    const byKioskId = groupBy(unsweptEvents, (e) => e.device.location.kioskId);
    const periodEnd = new Date();

    let payoutsCreated = 0;
    for (const [kioskId, events] of byKioskId) {
      const totalAmount = events.reduce(
        (sum, e) => sum.add(e.kioskShareAmount),
        new Prisma.Decimal(0),
      );
      if (totalAmount.isZero()) {
        continue;
      }

      const lastPayout = await this.prisma.payout.findFirst({
        where: { kioskId },
        orderBy: { periodEnd: 'desc' },
        select: { periodEnd: true },
      });
      const earliestConfirmedAt = events.reduce<Date>(
        (earliest, e) => (e.confirmedAt && e.confirmedAt < earliest ? e.confirmedAt : earliest),
        events[0].confirmedAt ?? periodEnd,
      );
      const periodStart = lastPayout?.periodEnd ?? earliestConfirmedAt;

      await this.prisma.$transaction(async (tx) => {
        const payout = await tx.payout.create({
          data: { kioskId, periodStart, periodEnd, totalAmount, status: 'pending' },
        });
        await tx.commissionEvent.updateMany({
          where: { id: { in: events.map((e) => e.id) } },
          data: { payoutId: payout.id },
        });
      });
      payoutsCreated++;
    }

    return { payoutsCreated };
  }

  /** Kicks off (or resumes) Stripe Connect Express onboarding for a kiosk. */
  async createStripeOnboardingLink(kioskId: string): Promise<{ url: string }> {
    const kiosk = await this.prisma.kiosk.findUnique({ where: { id: kioskId }, select: { stripeAccountId: true } });
    if (!kiosk) {
      throw new NotFoundException('Kiosk not found');
    }

    // Persisted immediately after creation, before the (more failure-prone, external)
    // account-link step — otherwise a link-creation failure on a brand-new account
    // leaves stripeAccountId unset, and every retry creates yet another orphaned
    // Stripe Express account for this kiosk instead of reusing the one just made.
    let accountId = kiosk.stripeAccountId;
    if (!accountId) {
      accountId = await this.stripeService.createExpressAccount();
      await this.prisma.kiosk.update({ where: { id: kioskId }, data: { stripeAccountId: accountId } });
    }

    const url = await this.stripeService.createOnboardingLink(accountId);
    return { url };
  }

  /** Admin-triggered: executes the actual Stripe transfer for a pending Payout. */
  async processPayout(payoutId: string): Promise<PayoutDto> {
    const payout = await this.prisma.payout.findUnique({ where: { id: payoutId }, include: { kiosk: true } });
    if (!payout) {
      throw new NotFoundException('Payout not found');
    }
    if (payout.status !== 'pending') {
      throw new BadRequestException(`Payout is not pending (current status: ${payout.status})`);
    }
    if (!payout.kiosk.stripeAccountId) {
      throw new BadRequestException('Kiosk has not connected a Stripe account');
    }

    // Atomically claim the payout before calling Stripe. Two concurrent requests could
    // otherwise both pass the status==='pending' check above and both create a real
    // Stripe transfer for the same payout — the affected-row count here tells us which
    // request actually won the race.
    const claim = await this.prisma.payout.updateMany({
      where: { id: payoutId, status: 'pending' },
      data: { status: 'processing' },
    });
    if (claim.count === 0) {
      throw new BadRequestException('Payout is not pending (already claimed by another request)');
    }

    try {
      const transfer = await this.stripeService.createTransfer(
        payout.kiosk.stripeAccountId,
        payout.totalAmount,
        payoutId,
      );
      const updated = await this.prisma.payout.update({
        where: { id: payoutId },
        data: { stripeTransferId: transfer.id },
      });
      return toPayoutDto(updated);
    } catch (err) {
      // Release the claim so a genuinely-failed attempt can be retried, rather than
      // leaving the payout stuck in "processing" with no transfer ever created.
      await this.prisma.payout.update({ where: { id: payoutId }, data: { status: 'pending' } });
      throw err;
    }
  }

  /**
   * Keeps Payout.status and the kiosk's Stripe connection state in sync with Stripe's own
   * view. Real Stripe never emits literal "transfer.paid"/"transfer.failed" events (the
   * spec's naming) — for a platform-balance-to-connected-account Transfer, "created" is the
   * closest real equivalent to "paid" (there's no separate later confirmation step for that
   * leg), and "reversed" is the closest real equivalent to "failed". Only reacts to the
   * event types this platform actually needs — everything else is a deliberate no-op, since
   * Stripe expects a 200 regardless.
   */
  async handleStripeWebhookEvent(event: Stripe.Event): Promise<void> {
    switch (event.type) {
      case 'transfer.created': {
        const transfer = event.data.object as Stripe.Transfer;
        await this.prisma.payout.updateMany({
          where: { stripeTransferId: transfer.id, status: 'processing' },
          data: { status: 'paid', paidAt: new Date() },
        });
        break;
      }
      case 'transfer.reversed': {
        const transfer = event.data.object as Stripe.Transfer;
        await this.prisma.payout.updateMany({
          where: { stripeTransferId: transfer.id },
          data: { status: 'failed' },
        });
        break;
      }
      case 'account.updated': {
        const account = event.data.object as Stripe.Account;
        await this.prisma.kiosk.updateMany({
          where: { stripeAccountId: account.id },
          data: { stripePayoutsEnabled: account.payouts_enabled ?? false },
        });
        break;
      }
      default:
        break;
    }
  }

  /** Admin view — every kiosk's payouts, with kiosk name + Stripe connection status inlined. */
  async findAllForAdmin(): Promise<PayoutDto[]> {
    const payouts = await this.prisma.payout.findMany({
      include: { kiosk: { select: { id: true, name: true, stripeAccountId: true, stripePayoutsEnabled: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return payouts.map((p) => ({
      ...toPayoutDto(p),
      kiosk: {
        id: p.kiosk.id,
        name: p.kiosk.name,
        stripeConnected: !!p.kiosk.stripeAccountId,
        stripePayoutsEnabled: p.kiosk.stripePayoutsEnabled,
      },
    }));
  }

  /** Kiosk-owner view — only their own kiosk's payout history, never another's. */
  async findAllForKiosk(kioskId: string): Promise<PayoutDto[]> {
    const payouts = await this.prisma.payout.findMany({
      where: { kioskId },
      orderBy: { createdAt: 'desc' },
    });
    return payouts.map(toPayoutDto);
  }
}

function toPayoutDto(payout: Payout): PayoutDto {
  return {
    id: payout.id,
    kioskId: payout.kioskId,
    periodStart: payout.periodStart,
    periodEnd: payout.periodEnd,
    totalAmount: payout.totalAmount.toNumber(),
    status: payout.status,
    stripeTransferId: payout.stripeTransferId,
    paidAt: payout.paidAt,
    createdAt: payout.createdAt,
  };
}
