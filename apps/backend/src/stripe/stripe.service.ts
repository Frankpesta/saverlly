import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

// Placeholder — lets the app boot and every non-Stripe route keep working in an
// environment with no real Stripe account configured yet. Any actual Stripe API call
// made with this key fails with a real (401) Stripe error rather than a silent no-op.
const PLACEHOLDER_SECRET_KEY = 'sk_test_placeholder_not_configured';

@Injectable()
export class StripeService {
  readonly client: Stripe;

  constructor(private readonly configService: ConfigService) {
    this.client = new Stripe(this.configService.get('STRIPE_SECRET_KEY') || PLACEHOLDER_SECRET_KEY);
  }

  /**
   * Creates the kiosk's Express account on first call (reused on every later call via
   * existingAccountId), then a fresh onboarding link — Stripe account links are single-use
   * and short-lived, so a new one is minted every time regardless of onboarding progress.
   */
  async createOnboardingLink(
    existingAccountId: string | null,
  ): Promise<{ url: string; accountId: string }> {
    const accountId = existingAccountId ?? (await this.client.accounts.create({ type: 'express' })).id;

    const accountLink = await this.client.accountLinks.create({
      account: accountId,
      refresh_url: this.configService.getOrThrow('STRIPE_CONNECT_REFRESH_URL'),
      return_url: this.configService.getOrThrow('STRIPE_CONNECT_RETURN_URL'),
      type: 'account_onboarding',
    });

    return { url: accountLink.url, accountId };
  }

  createTransfer(destinationAccountId: string, amount: number): Promise<Stripe.Transfer> {
    return this.client.transfers.create({
      amount: toStripeCents(amount),
      currency: 'usd',
      destination: destinationAccountId,
    });
  }

  constructWebhookEvent(payload: Buffer, signature: string): Stripe.Event {
    return this.client.webhooks.constructEvent(
      payload,
      signature,
      this.configService.getOrThrow('STRIPE_WEBHOOK_SECRET'),
    );
  }
}

// Stripe amounts are always integer minor units (cents for USD) — round rather than
// truncate so e.g. 19.995 (already an unusual case for a 2-decimal-place Decimal column,
// but defensive regardless) doesn't silently lose a cent.
export function toStripeCents(amount: number): number {
  return Math.round(amount * 100);
}
