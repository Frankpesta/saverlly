import { Text } from '@react-email/components';
import * as React from 'react';
import { EmailButton } from './components/email-button';
import { EmailLayout, emailStyles } from './components/email-layout';

const e = React.createElement;

export function formatDate(iso: string): string {
  // Explicit UTC so the rendered date doesn't drift with the email worker host's local
  // timezone. Otherwise a payout near midnight UTC could show the wrong calendar day.
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export function PayoutProcessedEmail({
  kioskName,
  amount,
  periodStart,
  periodEnd,
  payoutDate,
  earningsUrl,
  logoUrl,
}: {
  kioskName: string;
  amount: number;
  periodStart: string;
  periodEnd: string;
  payoutDate: string;
  earningsUrl: string;
  logoUrl: string;
}): React.ReactElement {
  const formattedAmount = amount.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  });
  return e(
    EmailLayout,
    { preview: `${formattedAmount} was sent to ${kioskName}`, logoUrl },
    e(Text, { style: emailStyles.heading }, 'Payout sent'),
    e(
      Text,
      { style: emailStyles.body },
      `A payout of ${formattedAmount} for "${kioskName}" was transferred to your connected Stripe account on ${formatDate(payoutDate)}.`,
    ),
    e(
      'div',
      { style: emailStyles.credentialBox },
      e(Text, { style: emailStyles.credentialLabel }, 'Period'),
      e(
        Text,
        {
          style: {
            ...emailStyles.credentialValue,
            fontFamily: 'inherit',
            fontSize: 15,
            marginBottom: 0,
          },
        },
        `${formatDate(periodStart)} to ${formatDate(periodEnd)}`,
      ),
    ),
    e(EmailButton, { href: earningsUrl }, 'View earnings'),
  );
}
