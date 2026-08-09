import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import Stripe from 'stripe';

// Placeholder — lets the app boot and every non-Stripe route keep working in an
// environment with no real Stripe account configured yet. Any actual Stripe API call
// made with this key fails with a real (401) Stripe error rather than a silent no-op.
const PLACEHOLDER_SECRET_KEY = 'sk_test_placeholder_not_configured';

@Injectable()
export class StripeService {
  readonly client: Stripe;

  constructor(private readonly configService: ConfigService) {
    this.client = new Stripe(this.configService.get('STRIPE_SECRET_KEY') || PLACEHOLDER_SECRET_KEY, {
      timeout: 10_000,
      maxNetworkRetries: 2,
    });
  }

  /**
   * Creates a brand-new Stripe Connect Express account. Callers must persist the
   * returned id before doing anything else that can fail (e.g. creating the account
   * link) — otherwise a transient failure on the next step leaves no record of this
   * account, and a retry creates a second orphaned Express account for the same kiosk.
   */
  async createExpressAccount(): Promise<string> {
    const account = await this.client.accounts.create({ type: 'express' });
    return account.id;
  }

  /** Stripe account links are single-use and short-lived — mint a fresh one on every call. */
  async createOnboardingLink(accountId: string): Promise<string> {
    const accountLink = await this.client.accountLinks.create({
      account: accountId,
      refresh_url: this.configService.getOrThrow('STRIPE_CONNECT_REFRESH_URL'),
      return_url: this.configService.getOrThrow('STRIPE_CONNECT_RETURN_URL'),
      type: 'account_onboarding',
    });
    return accountLink.url;
  }

  /**
   * idempotencyKey is the owning Payout's id — if this call is retried (our own retry
   * after a transient failure, or the Stripe SDK's own automatic network-error retry),
   * Stripe recognizes it as the same logical transfer instead of creating a duplicate.
   */
  createTransfer(destinationAccountId: string, amount: Prisma.Decimal, idempotencyKey: string): Promise<Stripe.Transfer> {
    return this.client.transfers.create(
      {
        amount: toStripeCents(amount),
        currency: 'usd',
        destination: destinationAccountId,
      },
      { idempotencyKey },
    );
  }

  constructWebhookEvent(payload: Buffer, signature: string): Stripe.Event {
    return this.client.webhooks.constructEvent(
      payload,
      signature,
      this.configService.getOrThrow('STRIPE_WEBHOOK_SECRET'),
    );
  }
}

// Stripe amounts are always integer minor units (cents for USD). Doing the *100 and
// rounding in Decimal-space (not as a native float multiply) means this stays exact
// regardless of the source column's precision, rather than relying on the specific
// bounds of today's Decimal(10,2) schema to keep float rounding harmless.
export function toStripeCents(amount: Prisma.Decimal): number {
  return amount.mul(100).toDecimalPlaces(0).toNumber();
}
