import { Text } from '@react-email/components';
import * as React from 'react';
import { EmailButton } from './components/email-button';
import { EmailLayout, emailStyles } from './components/email-layout';

const e = React.createElement;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
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
        `${formatDate(periodStart)} – ${formatDate(periodEnd)}`,
      ),
    ),
    e(EmailButton, { href: earningsUrl }, 'View earnings'),
  );
}
