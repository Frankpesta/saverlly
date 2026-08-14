import { Injectable } from '@nestjs/common';
import { NotificationType } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { NotificationsService } from './notifications.service';

interface NotifiableUser {
  id: string;
  email: string;
}

@Injectable()
export class NotificationTriggersService {
  constructor(private readonly notifications: NotificationsService) {}

  kioskOwnerCreated(
    user: NotifiableUser,
    temporaryPassword: string,
    kioskName: string,
  ) {
    return this.notifications.notify({
      userId: user.id,
      type: NotificationType.KIOSK_OWNER_CREATED,
      title: 'Welcome to Saverlly',
      body: `Your kiosk "${kioskName}" is live. Check your email for login details.`,
      email: {
        type: 'KIOSK_OWNER_WELCOME',
        to: user.email,
        kioskName,
        temporaryPassword,
      },
    });
  }

  locationManagerCreated(
    user: NotifiableUser,
    temporaryPassword: string,
    kioskName: string,
  ) {
    return this.notifications.notify({
      userId: user.id,
      type: NotificationType.LOCATION_MANAGER_CREATED,
      title: `You were added to ${kioskName}`,
      body: `You now have access to manage locations for "${kioskName}".`,
      email: {
        type: 'LOCATION_MANAGER_WELCOME',
        to: user.email,
        kioskName,
        temporaryPassword,
      },
    });
  }

  payoutProcessed(
    owner: NotifiableUser,
    kioskName: string,
    payout: {
      id: string;
      totalAmount: Prisma.Decimal;
      periodStart: Date;
      periodEnd: Date;
      paidAt: Date;
    },
  ) {
    return this.notifications.notify({
      userId: owner.id,
      type: NotificationType.PAYOUT_PROCESSED,
      title: 'Payout sent',
      body: `$${payout.totalAmount.toFixed(2)} was transferred to your connected account.`,
      metadata: { payoutId: payout.id },
      email: {
        type: 'PAYOUT_PROCESSED',
        to: owner.email,
        kioskName,
        amount: payout.totalAmount.toNumber(),
        periodStart: payout.periodStart.toISOString(),
        periodEnd: payout.periodEnd.toISOString(),
        payoutDate: payout.paidAt.toISOString(),
      },
    });
  }

  stripeOnboardingChanged(
    owner: NotifiableUser,
    kioskName: string,
    enabled: boolean,
  ) {
    return this.notifications.notify({
      userId: owner.id,
      type: NotificationType.STRIPE_ONBOARDING_CHANGED,
      title: enabled ? 'Payouts enabled' : 'Payouts paused',
      body: enabled
        ? 'Your Stripe account can now receive payouts.'
        : 'Your Stripe account needs attention before payouts can resume.',
      metadata: { enabled },
      email: {
        type: 'STRIPE_ONBOARDING_CHANGED',
        to: owner.email,
        kioskName,
        enabled,
      },
    });
  }

  commissionDigest(
    owner: NotifiableUser,
    kioskName: string,
    stats: {
      periodLabel: string;
      confirmedTotal: number;
      confirmedCount: number;
      reversedTotal: number;
      reversedCount: number;
    },
  ) {
    return this.notifications.notify({
      userId: owner.id,
      type: NotificationType.COMMISSION_DIGEST,
      title: 'Your commission summary',
      body: `${stats.confirmedCount} confirmed ($${stats.confirmedTotal.toFixed(2)}) in the last ${stats.periodLabel}.`,
      email: {
        type: 'COMMISSION_DIGEST',
        to: owner.email,
        kioskName,
        ...stats,
      },
    });
  }
}
