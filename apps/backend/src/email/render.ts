import * as React from 'react';
import { EmailJob } from './types/email-job.type';
import { CommissionDigestEmail } from './templates/commission-digest';
import { KioskOwnerWelcomeEmail } from './templates/kiosk-owner-welcome';
import { LocationManagerWelcomeEmail } from './templates/location-manager-welcome';
import { PayoutProcessedEmail } from './templates/payout-processed';
import { StripeOnboardingChangedEmail } from './templates/stripe-onboarding-changed';

export interface RenderedEmail {
  subject: string;
  react: React.ReactElement;
}

export interface EmailUrls {
  logoUrl: string;
  loginUrl: string;
  earningsUrl: string;
}

export function renderEmail(job: EmailJob, urls: EmailUrls): RenderedEmail {
  switch (job.type) {
    case 'KIOSK_OWNER_WELCOME':
      return {
        subject: `Welcome to Saverlly — ${job.kioskName} is live`,
        react: React.createElement(KioskOwnerWelcomeEmail, {
          kioskName: job.kioskName,
          email: job.to,
          temporaryPassword: job.temporaryPassword,
          loginUrl: urls.loginUrl,
          logoUrl: urls.logoUrl,
        }),
      };
    case 'LOCATION_MANAGER_WELCOME':
      return {
        subject: `You've been added to ${job.kioskName} on Saverlly`,
        react: React.createElement(LocationManagerWelcomeEmail, {
          kioskName: job.kioskName,
          email: job.to,
          temporaryPassword: job.temporaryPassword,
          loginUrl: urls.loginUrl,
          logoUrl: urls.logoUrl,
        }),
      };
    case 'PAYOUT_PROCESSED':
      return {
        subject: `Payout sent — ${job.kioskName}`,
        react: React.createElement(PayoutProcessedEmail, {
          kioskName: job.kioskName,
          amount: job.amount,
          periodStart: job.periodStart,
          periodEnd: job.periodEnd,
          payoutDate: job.payoutDate,
          earningsUrl: urls.earningsUrl,
          logoUrl: urls.logoUrl,
        }),
      };
    case 'STRIPE_ONBOARDING_CHANGED':
      return {
        subject: job.enabled
          ? `Payouts enabled — ${job.kioskName}`
          : `Payouts paused — ${job.kioskName}`,
        react: React.createElement(StripeOnboardingChangedEmail, {
          kioskName: job.kioskName,
          enabled: job.enabled,
          earningsUrl: urls.earningsUrl,
          logoUrl: urls.logoUrl,
        }),
      };
    case 'COMMISSION_DIGEST':
      return {
        subject: `Your commission summary — ${job.kioskName}`,
        react: React.createElement(CommissionDigestEmail, {
          kioskName: job.kioskName,
          periodLabel: job.periodLabel,
          confirmedTotal: job.confirmedTotal,
          confirmedCount: job.confirmedCount,
          reversedTotal: job.reversedTotal,
          reversedCount: job.reversedCount,
          earningsUrl: urls.earningsUrl,
          logoUrl: urls.logoUrl,
        }),
      };
  }
}
