import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  CommissionStatus,
  Payout,
  PayoutStatus,
  Prisma,
  UserRole,
} from '@prisma/client';
import type Stripe from 'stripe';
import { groupBy } from '../common/collections/group-by.util';
import { NotificationTriggersService } from '../notifications/notification-triggers.service';
import { PrismaService } from '../prisma/prisma.service';
import { StripeService } from '../stripe/stripe.service';
import { PayoutDto } from './dto/payout.dto';

// Thrown (and caught) inside generatePayouts() when a concurrent run has already claimed some
// of the events this run read as unswept, forcing its transaction to roll back cleanly rather
// than persist a Payout whose totalAmount double-counts (or undercounts) commission events.
class ConcurrentPayoutClaimError extends Error {}

@Injectable()
export class PayoutsService {
  private readonly logger = new Logger(PayoutsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stripeService: StripeService,
    private readonly notificationTriggers: NotificationTriggersService,
  ) {}

  /**
   * Aggregates every kiosk's not-yet-swept CONFIRMED CommissionEvents into a new
   * Payout(status: "pending") and marks those events as belonging to it, so a later
   * run never double-counts them. Kiosks with nothing payable are skipped entirely
   * no empty $0 Payout records. PENDING/REVERSED events are never touched here.
   */
  async generatePayouts(): Promise<{ payoutsCreated: number }> {
    const unsweptEvents = await this.prisma.commissionEvent.findMany({
      where: { status: CommissionStatus.CONFIRMED, payoutId: null },
      include: {
        device: { select: { location: { select: { kioskId: true } } } },
      },
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
        (earliest, e) =>
          e.confirmedAt && e.confirmedAt < earliest ? e.confirmedAt : earliest,
        events[0].confirmedAt ?? periodEnd,
      );
      const periodStart = lastPayout?.periodEnd ?? earliestConfirmedAt;

      try {
        await this.prisma.$transaction(async (tx) => {
          const payout = await tx.payout.create({
            data: {
              kioskId,
              periodStart,
              periodEnd,
              totalAmount,
              status: PayoutStatus.PENDING,
            },
          });
          // Conditional claim (payoutId: null in the where, not just the id list) so a
          // concurrent generatePayouts run can never silently overwrite this one's claim on
          // the same events -- whichever transaction's updateMany loses the race claims zero
          // of the contested rows instead of last-writer-wins clobbering the other's payoutId.
          const claimed = await tx.commissionEvent.updateMany({
            where: { id: { in: events.map((e) => e.id) }, payoutId: null },
            data: { payoutId: payout.id },
          });
          if (claimed.count !== events.length) {
            throw new ConcurrentPayoutClaimError(kioskId);
          }
        });
        payoutsCreated++;
      } catch (error) {
        if (error instanceof ConcurrentPayoutClaimError) {
          this.logger.warn(
            `Skipped payout for kiosk ${kioskId}: a concurrent run already claimed some of ` +
              `its unswept commission events. The transaction rolled back cleanly -- those ` +
              `events remain unswept and will be picked up correctly by the next run.`,
          );
          continue;
        }
        throw error;
      }
    }

    return { payoutsCreated };
  }

  /** Kicks off (or resumes) Stripe Connect Express onboarding for a kiosk. */
  async createStripeOnboardingLink(kioskId: string): Promise<{ url: string }> {
    const kiosk = await this.prisma.kiosk.findUnique({
      where: { id: kioskId },
      select: { stripeAccountId: true },
    });
    if (!kiosk) {
      throw new NotFoundException('Kiosk not found');
    }

    // Persisted immediately after creation, before the (more failure-prone, external)
    // account-link step. Otherwise a link-creation failure on a brand-new account
    // leaves stripeAccountId unset, and every retry creates yet another orphaned
    // Stripe Express account for this kiosk instead of reusing the one just made.
    let accountId = kiosk.stripeAccountId;
    if (!accountId) {
      accountId = await this.stripeService.createExpressAccount();
      await this.prisma.kiosk.update({
        where: { id: kioskId },
        data: { stripeAccountId: accountId },
      });
    }

    const url = await this.stripeService.createOnboardingLink(accountId);
    return { url };
  }

  /** Admin-triggered: executes the actual Stripe transfer for a pending Payout. */
  async processPayout(payoutId: string): Promise<PayoutDto> {
    const payout = await this.prisma.payout.findUnique({
      where: { id: payoutId },
      include: { kiosk: true },
    });
    if (!payout) {
      throw new NotFoundException('Payout not found');
    }
    if (payout.status !== PayoutStatus.PENDING) {
      throw new BadRequestException(
        `Payout is not pending (current status: ${payout.status})`,
      );
    }
    if (!payout.kiosk.stripeAccountId) {
      throw new BadRequestException('Kiosk has not connected a Stripe account');
    }

    // Atomically claim the payout before calling Stripe. Two concurrent requests could
    // otherwise both pass the status==='pending' check above and both create a real
    // Stripe transfer for the same payout. The affected-row count here tells us which
    // request actually won the race.
    const claim = await this.prisma.payout.updateMany({
      where: { id: payoutId, status: PayoutStatus.PENDING },
      data: { status: PayoutStatus.PROCESSING },
    });
    if (claim.count === 0) {
      throw new BadRequestException(
        'Payout is not pending (already claimed by another request)',
      );
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
      await this.prisma.payout.update({
        where: { id: payoutId },
        data: { status: PayoutStatus.PENDING },
      });
      throw err;
    }
  }

  /**
   * Keeps Payout.status and the kiosk's Stripe connection state in sync with Stripe's own
   * view. Real Stripe never emits literal "transfer.paid"/"transfer.failed" events (the
   * spec's naming). For a platform-balance-to-connected-account Transfer, "created" is the
   * closest real equivalent to "paid" (there's no separate later confirmation step for that
   * leg), and "reversed" is the closest real equivalent to "failed". Only reacts to the
   * event types this platform actually needs. Everything else is a deliberate no-op, since
   * Stripe expects a 200 regardless.
   */
  async handleStripeWebhookEvent(event: Stripe.Event): Promise<void> {
    switch (event.type) {
      case 'transfer.created': {
        const transfer = event.data.object;
        // findFirst only to fetch the kiosk/owner to notify. The actual state transition
        // below is a conditional updateMany re-matching status:'processing', so two
        // concurrent deliveries for the same transfer (Stripe's at-least-once retry can
        // arrive overlapping, not just sequentially) can't both win the claim: Postgres
        // serializes the two UPDATEs on the row, and whichever runs second re-evaluates its
        // WHERE clause against the just-committed row, so its status:'processing' no longer
        // matches and it notifies no one.
        const payout = await this.prisma.payout.findFirst({
          where: {
            stripeTransferId: transfer.id,
            status: PayoutStatus.PROCESSING,
          },
          include: {
            kiosk: {
              include: {
                users: { where: { role: UserRole.KIOSK_OWNER }, take: 1 },
              },
            },
          },
        });
        if (!payout) break;

        const paidAt = new Date();
        const claimed = await this.prisma.payout.updateMany({
          where: { id: payout.id, status: PayoutStatus.PROCESSING },
          data: { status: PayoutStatus.PAID, paidAt },
        });
        if (claimed.count === 0) break;

        const owner = payout.kiosk.users[0];
        if (owner) {
          await this.notificationTriggers.payoutProcessed(
            owner,
            payout.kiosk.name,
            {
              id: payout.id,
              totalAmount: payout.totalAmount,
              periodStart: payout.periodStart,
              periodEnd: payout.periodEnd,
              paidAt,
            },
          );
        }
        break;
      }
      case 'transfer.reversed': {
        const transfer = event.data.object;
        await this.prisma.payout.updateMany({
          where: { stripeTransferId: transfer.id },
          data: { status: PayoutStatus.FAILED },
        });
        break;
      }
      case 'account.updated': {
        const account = event.data.object;
        const newValue = account.payouts_enabled ?? false;

        const kiosk = await this.prisma.kiosk.findFirst({
          where: { stripeAccountId: account.id },
          include: {
            users: { where: { role: UserRole.KIOSK_OWNER }, take: 1 },
          },
        });
        // Not ours, or no actual flip. Stripe fires account.updated for lots of unrelated
        // account field changes, not just payouts_enabled, so without this comparison every
        // incidental webhook delivery would spam an email/notification.
        if (!kiosk || kiosk.stripePayoutsEnabled === newValue) break;

        // Conditional updateMany (re-matching the previous value) instead of an
        // unconditional update. Closes the same concurrent-duplicate-delivery race as
        // transfer.created above: only the delivery that still sees the pre-flip value wins
        // the claim and notifies.
        const claimed = await this.prisma.kiosk.updateMany({
          where: {
            id: kiosk.id,
            stripePayoutsEnabled: kiosk.stripePayoutsEnabled,
          },
          data: { stripePayoutsEnabled: newValue },
        });
        if (claimed.count === 0) break;

        const owner = kiosk.users[0];
        if (owner) {
          await this.notificationTriggers.stripeOnboardingChanged(
            owner,
            kiosk.name,
            newValue,
          );
        }
        break;
      }
      default:
        break;
    }
  }

  /** Admin view. Every kiosk's payouts, with kiosk name + Stripe connection status inlined. */
  async findAllForAdmin(): Promise<PayoutDto[]> {
    const payouts = await this.prisma.payout.findMany({
      include: {
        kiosk: {
          select: {
            id: true,
            name: true,
            stripeAccountId: true,
            stripePayoutsEnabled: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      // Safety cap, not real pagination -- see merchants.service.ts's findAll for the general
      // reasoning and commissions.service.ts's findAllForAdmin for why this one's higher than
      // the catalog-entity caps (an ever-growing event log, not a bounded catalog).
      take: 2000,
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

  /** Kiosk-owner view. Only their own kiosk's payout history, never another's. */
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
