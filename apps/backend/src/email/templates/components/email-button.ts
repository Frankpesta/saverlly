import { Button } from '@react-email/components';
import * as React from 'react';
import { emailStyles } from './email-layout';

const e = React.createElement;

export function EmailButton({
  href,
  children,
}: {
  href: string;
  children?: React.ReactNode;
}): React.ReactElement {
  return e(
    Button,
    {
      href,
      style: {
        backgroundColor: emailStyles.teal,
        color: emailStyles.black,
        fontSize: 15,
        fontWeight: 700,
        padding: '12px 24px',
        borderRadius: 999,
        textDecoration: 'none',
        display: 'inline-block',
      },
    },
    children,
  );
}
