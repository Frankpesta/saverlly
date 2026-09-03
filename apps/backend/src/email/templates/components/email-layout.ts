import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Img,
  Preview,
  Section,
  Text,
} from '@react-email/components';
import * as React from 'react';

const e = React.createElement;

const TEAL = '#58C3B7';
const BLACK = '#1C1C1C';
const MUTED = '#6B6B6B';
// Web-safe fallback stack. The dashboard's Plus Jakarta Sans isn't reliably rendered by
// most email clients (no self-hosted @font-face support), so brand colors carry the
// identity here instead of the display font.
const FONT_STACK = 'Helvetica, Arial, sans-serif';

export function EmailLayout({
  preview,
  logoUrl,
  children,
}: {
  preview: string;
  logoUrl: string;
  children?: React.ReactNode;
}): React.ReactElement {
  return e(
    Html,
    null,
    e(Head),
    e(Preview, null, preview),
    e(
      Body,
      {
        style: {
          backgroundColor: '#F5F5F4',
          fontFamily: FONT_STACK,
          margin: 0,
          padding: '32px 0',
        },
      },
      e(
        Container,
        {
          style: {
            backgroundColor: '#FFFFFF',
            maxWidth: 600,
            borderRadius: 16,
            overflow: 'hidden',
          },
        },
        e(
          Section,
          { style: { backgroundColor: BLACK, padding: '24px 32px' } },
          e(Img, {
            src: logoUrl,
            alt: 'Saverlly',
            height: 28,
            style: { display: 'block' },
          }),
        ),
        e(Section, { style: { borderTop: `3px solid ${TEAL}` } }),
        e(Section, { style: { padding: '32px' } }, children),
        e(Hr, { style: { borderColor: '#E5E5E5', margin: 0 } }),
        e(
          Section,
          { style: { padding: '20px 32px' } },
          e(
            Text,
            {
              style: {
                color: MUTED,
                fontSize: 12,
                lineHeight: '18px',
                margin: 0,
              },
            },
            'Saverlly, the kiosk affiliate savings platform. This is a transactional email related to your account.',
          ),
        ),
      ),
    ),
  );
}

export const emailStyles = {
  teal: TEAL,
  black: BLACK,
  muted: MUTED,
  heading: { color: BLACK, fontSize: 22, fontWeight: 700, margin: '0 0 16px' },
  body: { color: BLACK, fontSize: 15, lineHeight: '24px', margin: '0 0 16px' },
  credentialBox: {
    backgroundColor: '#F5F5F4',
    borderRadius: 12,
    padding: '16px 20px',
    margin: '0 0 24px',
  },
  credentialLabel: {
    color: MUTED,
    fontSize: 12,
    textTransform: 'uppercase' as const,
    margin: '0 0 4px',
    letterSpacing: 0.4,
  },
  credentialValue: {
    color: BLACK,
    fontSize: 16,
    fontFamily: 'monospace',
    margin: '0 0 12px',
    wordBreak: 'break-all' as const,
  },
};
