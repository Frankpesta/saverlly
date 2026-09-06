import * as Sentry from "@sentry/nextjs"

// NEXT_PUBLIC_ is correct here (unlike this project's usual avoid-build-time-envs preference,
// see download-agent-button.tsx/platform-section.tsx) -- a Sentry DSN is meant to be public,
// it only lets a client submit error events, not read anything back. No-op until it's set, same
// posture as src/instrumentation.ts on the server side.
if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({ dsn: process.env.NEXT_PUBLIC_SENTRY_DSN })
}
