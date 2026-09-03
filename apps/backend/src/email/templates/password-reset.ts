import { Text } from '@react-email/components';
import * as React from 'react';
import { EmailButton } from './components/email-button';
import { EmailLayout, emailStyles } from './components/email-layout';

const e = React.createElement;

export function PasswordResetEmail({
  resetUrl,
  logoUrl,
  expiresInMinutes,
}: {
  resetUrl: string;
  logoUrl: string;
  expiresInMinutes: number;
}): React.ReactElement {
  return e(
    EmailLayout,
    { preview: 'Reset your Saverlly password', logoUrl },
    e(Text, { style: emailStyles.heading }, 'Reset your password'),
    e(
      Text,
      { style: emailStyles.body },
      `We got a request to reset your Saverlly password. This link expires in ${expiresInMinutes} minutes and can only be used once.`,
    ),
    e(EmailButton, { href: resetUrl }, 'Reset password'),
    e(
      Text,
      {
        style: {
          ...emailStyles.body,
          marginTop: 16,
          fontSize: 13,
          color: emailStyles.muted,
        },
      },
      "If you didn't request this, you can safely ignore this email. Your password won't change.",
    ),
  );
}
