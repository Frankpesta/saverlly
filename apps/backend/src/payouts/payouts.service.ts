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
import { NotificationTriggersService } from '../notifications/notification-triggers.service';
import { serializable } from '../common/prisma/serializable.util';
import { toStripeCents } from '../stripe/stripe.service';
import { PrismaService } from '../prisma/prisma.service';
import { StripeService } from '../stripe/stripe.service';
import { PayoutDto } from './dto/payout.dto';

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
    const kiosks = await this.prisma.kiosk.findMany({ select: { id: true } });
    let payoutsCreated = 0;
    for (const kiosk of kiosks) {
      const created = await serializable(this.prisma, async (tx) => {
        const events = await tx.commissionEvent.findMany({
          where: {
            status: CommissionStatus.CONFIRMED,
            payoutId: null,
            isTest: false,
            device: { location: { kioskId: kiosk.id } },
          },
        });
        const adjustments = await tx.commissionAdjustment.findMany({
          where: { kioskId: kiosk.id, payoutId: null },
        });
        const totalAmount = events
          .reduce(
            (sum, event) => sum.add(event.kioskShareAmount),
            new Prisma.Decimal(0),
          )
          .add(
            adjustments.reduce(
              (sum, adjustment) => sum.add(adjustment.amount),
              new Prisma.Decimal(0),
            ),
          );
        // Carry debt forward until real earnings cover it. No negative Stripe transfers.
        if (!totalAmount.greaterThan(0)) return false;
        const periodEnd = new Date();
        const lastPayout = await tx.payout.findFirst({
          where: { kioskId: kiosk.id },
          orderBy: { periodEnd: 'desc' },
        });
        const periodStart =
          lastPayout?.periodEnd ??
          events.reduce(
            (date, event) =>
              event.confirmedAt && event.confirmedAt < date
                ? event.confirmedAt
                : date,
            periodEnd,
          );
        const payout = await tx.payout.create({
          data: {
            kioskId: kiosk.id,
            periodStart,
            periodEnd,
            totalAmount,
            status: PayoutStatus.PENDING,
          },
        });
        await tx.commissionEvent.updateMany({
          where: {
            id: { in: events.map((e) => e.id) },
            payoutId: null,
            status: CommissionStatus.CONFIRMED,
          },
          data: { payoutId: payout.id },
        });
        await tx.commissionAdjustment.updateMany({
          where: { id: { in: adjustments.map((a) => a.id) }, payoutId: null },
          data: { payoutId: payout.id },
        });
        return true;
      });
      if (created) payoutsCreated++;
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
    const payout = await serializable(this.prisma, async (tx) => {
      const current = await tx.payout.findUnique({
        where: { id: payoutId },
        include: { kiosk: true },
      });
      if (!current) throw new NotFoundException('Payout not found');
      if (current.status !== PayoutStatus.PENDING)
        throw new BadRequestException(
          'Payout is not pending; use recovery for processing payouts',
        );
      if (!current.kiosk.stripeAccountId)
        throw new BadRequestException(
          'Kiosk has not connected a Stripe account',
        );
      if (!current.totalAmount.greaterThan(0))
        throw new BadRequestException(
          'Payout has no payable balance after reversals',
        );
      if (
        await tx.commissionEvent.count({
          where: {
            payoutId,
            OR: [
              { isTest: true },
              { networkReference: { startsWith: 'MOCKCONV-' } },
            ],
          },
        })
      ) {
        throw new BadRequestException('Mock commissions cannot be transferred');
      }
      const deductions = await tx.commissionAdjustment.findMany({
        where: { kioskId: current.kioskId, payoutId: null },
      });
      const totalAmount = deductions.reduce(
        (sum, adjustment) => sum.add(adjustment.amount),
        current.totalAmount,
      );
      if (!totalAmount.greaterThan(0)) {
        await tx.commissionEvent.updateMany({
          where: { payoutId },
          data: { payoutId: null },
        });
        await tx.commissionAdjustment.updateMany({
          where: { payoutId },
          data: { payoutId: null },
        });
        await tx.payout.update({
          where: { id: payoutId },
          data: { status: PayoutStatus.FAILED, totalAmount: 0 },
        });
        return null;
      }
      await tx.commissionAdjustment.updateMany({
        where: { id: { in: deductions.map((d) => d.id) }, payoutId: null },
        data: { payoutId },
      });
      return tx.payout.update({
        where: { id: payoutId },
        data: {
          status: PayoutStatus.PROCESSING,
          totalAmount,
          transferStartedAt: new Date(),
          transferDestination: current.kiosk.stripeAccountId,
        },
      });
    });
    if (!payout)
      throw new BadRequestException(
        'Payout earnings were carried forward to cover commission reversals',
      );
    // Keep the claim on ambiguous network errors. Resetting it to PENDING would permit
    // changing the amount/destination after Stripe may already have accepted the request.
    const transfer = await this.stripeService.createTransfer(
      payout.transferDestination!,
      payout.totalAmount,
      payoutId,
    );
    await this.acceptTransfer(transfer, payoutId);
    return toPayoutDto(
      await this.prisma.payout.findUniqueOrThrow({ where: { id: payoutId } }),
    );
  }

  async recoverPayout(payoutId: string): Promise<PayoutDto> {
    const payout = await this.prisma.payout.findUnique({
      where: { id: payoutId },
    });
    if (!payout) throw new NotFoundException('Payout not found');
    if (payout.status !== PayoutStatus.PROCESSING) return toPayoutDto(payout);
    let transfer = payout.stripeTransferId
      ? await this.stripeService.retrieveTransfer(payout.stripeTransferId)
      : null;
    if (!transfer && payout.transferStartedAt && payout.transferDestination) {
      transfer = await this.stripeService.findTransferForPayout(
        payoutId,
        payout.transferDestination,
        payout.transferStartedAt,
      );
      if (!transfer) {
        if (
          await this.prisma.commissionEvent.count({
            where: {
              payoutId,
              OR: [
                { isTest: true },
                { networkReference: { startsWith: 'MOCKCONV-' } },
              ],
            },
          })
        ) {
          throw new BadRequestException(
            'Mock commissions cannot be transferred',
          );
        }
        // Stripe can prune keys after 24h. Never issue a new transfer with an aged key.
        if (
          Date.now() - payout.transferStartedAt.getTime() >=
          23 * 60 * 60 * 1000
        ) {
          throw new BadRequestException(
            'Transfer outcome requires manual Stripe reconciliation; automatic retry window has elapsed',
          );
        }
        transfer = await this.stripeService.createTransfer(
          payout.transferDestination,
          payout.totalAmount,
          payoutId,
        );
      }
    }
    if (!transfer)
      throw new BadRequestException(
        'Legacy payout has no recoverable transfer identity; reconcile it with Stripe',
      );
    await this.acceptTransfer(transfer, payoutId);
    return toPayoutDto(
      await this.prisma.payout.findUniqueOrThrow({ where: { id: payoutId } }),
    );
  }

  async recoverProcessingPayouts(): Promise<void> {
    let cursor: string | undefined;
    for (;;) {
      const payouts = await this.prisma.payout.findMany({
        where: { status: PayoutStatus.PROCESSING },
        orderBy: { id: 'asc' },
        take: 100,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      if (!payouts.length) break;
      cursor = payouts[payouts.length - 1].id;
      for (const payout of payouts) {
        try {
          await this.recoverPayout(payout.id);
        } catch (error) {
          this.logger.error(
            'Payout recovery requires attention: ' + payout.id,
            error,
          );
        }
      }
    }
  }

  private async acceptTransfer(
    transfer: Stripe.Transfer,
    payoutId?: string,
  ): Promise<void> {
    const metadataId = payoutId ?? transfer.metadata?.payoutId;
    const payout = await this.prisma.payout.findFirst({
      where: {
        OR: [
          { stripeTransferId: transfer.id },
          ...(metadataId ? [{ id: metadataId }] : []),
        ],
      },
      include: {
        kiosk: {
          include: {
            users: { where: { role: UserRole.KIOSK_OWNER }, take: 1 },
          },
        },
      },
    });
    if (!payout) return;
    if (metadataId && payout.id !== metadataId)
      throw new BadRequestException(
        'Transfer metadata does not match its stored payout',
      );
    // Validate metadata matches before attaching a not-yet-persisted transfer ID.
    if (payout.stripeTransferId && payout.stripeTransferId !== transfer.id)
      throw new BadRequestException('Payout already has another transfer');
    const destination =
      typeof transfer.destination === 'string'
        ? transfer.destination
        : transfer.destination?.id;
    if (
      transfer.amount !== toStripeCents(payout.totalAmount) ||
      transfer.currency !== 'usd' ||
      destination !==
        (payout.transferDestination ?? payout.kiosk.stripeAccountId)
    )
      throw new BadRequestException(
        'Transfer does not match payout amount, currency or destination',
      );
    const paidAt = new Date();
    const reversed = transfer.reversed || transfer.amount_reversed > 0;
    const claimed = await this.prisma.payout.updateMany({
      where: {
        id: payout.id,
        status: {
          in: reversed
            ? [PayoutStatus.PROCESSING, PayoutStatus.PAID]
            : [PayoutStatus.PROCESSING],
        },
      },
      data: {
        stripeTransferId: transfer.id,
        status: reversed ? PayoutStatus.FAILED : PayoutStatus.PAID,
        ...(reversed ? {} : { paidAt }),
      },
    });
    if (!claimed.count || reversed) return;
    const owner = payout.kiosk.users[0];
    if (owner) {
      try {
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
      } catch (error) {
        this.logger.error(
          'Payout paid, but notification failed: ' + payout.id,
          error,
        );
      }
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
      case 'transfer.created':
      case 'transfer.reversed': {
        // Read the current transfer, so a delayed created event cannot undo a reversal.
        const transfer = await this.stripeService.retrieveTransfer(
          event.data.object.id,
        );
        await this.acceptTransfer(transfer);
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
