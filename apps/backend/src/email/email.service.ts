import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import * as React from 'react';

// Placeholder — lets the app boot and every non-email route keep working in an environment
// with no real Resend account configured yet, mirroring StripeService's PLACEHOLDER_SECRET_KEY.
const PLACEHOLDER_API_KEY = 're_placeholder_not_configured';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly resend: Resend;

  constructor(private readonly configService: ConfigService) {
    this.resend = new Resend(
      this.configService.get<string>('RESEND_API_KEY') || PLACEHOLDER_API_KEY,
    );
  }

  async send(
    to: string,
    subject: string,
    react: React.ReactElement,
    idempotencyKey?: string,
  ): Promise<void> {
    // Deliberate, small deviation from StripeService's "placeholder key, fail loud only when
    // called" pattern: a failed *background job* fails silently 3x with no visible signal,
    // unlike a synchronous Stripe call that surfaces immediately to whoever triggered it. So
    // without a real key, log instead of attempting a call that would just retry-and-fail.
    if (!this.configService.get<string>('RESEND_API_KEY')) {
      this.logger.warn(
        `RESEND_API_KEY not set — logging email instead of sending (idempotencyKey=${idempotencyKey ?? 'none'})`,
      );
      return;
    }

    const from = this.configService.get<string>(
      'EMAIL_FROM_ADDRESS',
      'Saverlly <onboarding@resend.dev>',
    );
    const result = await this.resend.emails.send(
      { from, to, subject, react },
      idempotencyKey ? { idempotencyKey } : undefined,
    );
    if (result.error) {
      throw new Error(`Resend send failed: ${result.error.message}`);
    }
  }
}
