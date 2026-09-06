import * as Sentry from '@sentry/node';

/**
 * Same "build it now, activate later" posture as StripeService/EmailService: no-ops entirely
 * when SENTRY_DSN is unset (dev, and prod until a real Sentry project exists), so nothing
 * needs a real account today. Once a DSN is set, AllExceptionsFilter (the single place every
 * otherwise-uncaught exception already funnels through) starts reporting to it -- no other
 * call site needs to know Sentry exists.
 */
export function initSentry(): void {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;
  Sentry.init({ dsn, environment: process.env.NODE_ENV ?? 'development' });
}
