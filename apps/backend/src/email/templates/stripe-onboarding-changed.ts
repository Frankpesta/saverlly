import { Text } from '@react-email/components';
import * as React from 'react';
import { EmailButton } from './components/email-button';
import { EmailLayout, emailStyles } from './components/email-layout';

const e = React.createElement;

export function StripeOnboardingChangedEmail({
  kioskName,
  enabled,
  earningsUrl,
  logoUrl,
}: {
  kioskName: string;
  enabled: boolean;
  earningsUrl: string;
  logoUrl: string;
}): React.ReactElement {
  const bodyText = enabled
    ? `Your Stripe account for "${kioskName}" has finished onboarding and can now receive payouts.`
    : `Your Stripe account for "${kioskName}" needs attention before payouts can resume. Stripe reported that your onboarding status changed.`;

  return e(
    EmailLayout,
    {
      preview: enabled
        ? `Payouts are now enabled for ${kioskName}`
        : `Payouts are paused for ${kioskName}`,
      logoUrl,
    },
    e(
      Text,
      { style: emailStyles.heading },
      enabled ? 'Payouts enabled' : 'Payouts paused',
    ),
    e(Text, { style: emailStyles.body }, bodyText),
    e(
      EmailButton,
      { href: earningsUrl },
      enabled ? 'View earnings' : 'Revisit onboarding',
    ),
  );
}
