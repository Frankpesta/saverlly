import type { Instrumentation } from "next"

// Same "build it now, activate later" posture as the backend's common/sentry.ts: a no-op
// entirely until SENTRY_DSN is set, so nothing needs a real Sentry account today.
export async function register() {
  if (!process.env.SENTRY_DSN) return
  const Sentry = await import("@sentry/nextjs")
  Sentry.init({ dsn: process.env.SENTRY_DSN, environment: process.env.NODE_ENV })
}

// Reports server-side errors (Server Components, Route Handlers, Server Actions, the
// proxy/middleware) -- the Next.js-native hook for this, see next/dist/docs' instrumentation
// file-convention guide. Client-side errors are handled separately, see instrumentation-client.ts.
export const onRequestError: Instrumentation.onRequestError = async (err) => {
  if (!process.env.SENTRY_DSN) return
  const Sentry = await import("@sentry/nextjs")
  Sentry.captureException(err)
}
