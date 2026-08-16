import { Column, Row, Text } from '@react-email/components';
import * as React from 'react';
import { EmailButton } from './components/email-button';
import { EmailLayout, emailStyles } from './components/email-layout';

const e = React.createElement;

function formatCurrency(amount: number): string {
  return amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

export function CommissionDigestEmail({
  kioskName,
  periodLabel,
  confirmedTotal,
  confirmedCount,
  reversedTotal,
  reversedCount,
  earningsUrl,
  logoUrl,
}: {
  kioskName: string;
  periodLabel: string;
  confirmedTotal: number;
  confirmedCount: number;
  reversedTotal: number;
  reversedCount: number;
  earningsUrl: string;
  logoUrl: string;
}): React.ReactElement {
  return e(
    EmailLayout,
    {
      preview: `Your ${periodLabel} commission summary for ${kioskName}`,
      logoUrl,
    },
    e(Text, { style: emailStyles.heading }, 'Your commission summary'),
    e(
      Text,
      { style: emailStyles.body },
      `Here's what happened for "${kioskName}" in the last ${periodLabel}.`,
    ),
    e(Row, {
      style: emailStyles.credentialBox,
      children: [
        e(
          Column,
          { key: 'confirmed' },
          e(Text, { style: emailStyles.credentialLabel }, 'Confirmed'),
          e(
            Text,
            {
              style: {
                ...emailStyles.credentialValue,
                fontFamily: 'inherit',
                fontSize: 20,
                marginBottom: 0,
              },
            },
            formatCurrency(confirmedTotal),
          ),
          e(
            Text,
            { style: { color: emailStyles.muted, fontSize: 13, margin: 0 } },
            `${confirmedCount} events`,
          ),
        ),
        e(
          Column,
          { key: 'reversed' },
          e(Text, { style: emailStyles.credentialLabel }, 'Reversed'),
          e(
            Text,
            {
              style: {
                ...emailStyles.credentialValue,
                fontFamily: 'inherit',
                fontSize: 20,
                marginBottom: 0,
              },
            },
            formatCurrency(reversedTotal),
          ),
          e(
            Text,
            { style: { color: emailStyles.muted, fontSize: 13, margin: 0 } },
            `${reversedCount} events`,
          ),
        ),
      ],
    }),
    e(EmailButton, { href: earningsUrl }, 'View full earnings'),
  );
}
