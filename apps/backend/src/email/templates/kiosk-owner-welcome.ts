import { Text } from '@react-email/components';
import * as React from 'react';
import { EmailButton } from './components/email-button';
import { EmailLayout, emailStyles } from './components/email-layout';

const e = React.createElement;

export function KioskOwnerWelcomeEmail({
  kioskName,
  email,
  temporaryPassword,
  loginUrl,
  logoUrl,
}: {
  kioskName: string;
  email: string;
  temporaryPassword: string;
  loginUrl: string;
  logoUrl: string;
}): React.ReactElement {
  return e(
    EmailLayout,
    { preview: `Your kiosk "${kioskName}" is live on Saverlly`, logoUrl },
    e(Text, { style: emailStyles.heading }, 'Welcome to Saverlly'),
    e(
      Text,
      { style: emailStyles.body },
      `Your kiosk "${kioskName}" has been created and is ready to go. We've set up your owner account with the credentials below.`,
    ),
    e(
      'div',
      { style: emailStyles.credentialBox },
      e(Text, { style: emailStyles.credentialLabel }, 'Email'),
      e(Text, { style: emailStyles.credentialValue }, email),
      e(Text, { style: emailStyles.credentialLabel }, 'Temporary password'),
      e(
        Text,
        { style: { ...emailStyles.credentialValue, marginBottom: 0 } },
        temporaryPassword,
      ),
    ),
    e(
      Text,
      { style: emailStyles.body },
      "For security, you'll be asked to set a new password the first time you log in.",
    ),
    e(EmailButton, { href: loginUrl }, 'Log in to your dashboard'),
  );
}
