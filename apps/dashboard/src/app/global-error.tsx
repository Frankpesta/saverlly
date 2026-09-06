"use client"

import { useEffect } from "react"
import * as Sentry from "@sentry/nextjs"

// Catches errors thrown by the root layout itself (fonts, AppProviders, etc) -- the one case
// error.tsx can't catch, since error.tsx is rendered *inside* the root layout. Deliberately
// has no dependency on anything from layout.tsx (fonts, AppProviders, globals.css) since those
// are exactly what might be broken; renders its own bare <html>/<body> with inline styles only.
// @sentry/nextjs is independent of all that, so it's safe to keep here.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console -- see error.tsx: last line of defense, no
    // request/response cycle left to route through the backend's structured logger.
    console.error(error)
    // No-op until NEXT_PUBLIC_SENTRY_DSN is set (see instrumentation-client.ts).
    Sentry.captureException(error)
  }, [error])

  return (
    <html lang="en">
      <body
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, sans-serif",
          padding: "1.5rem",
        }}
      >
        <div style={{ textAlign: "center", maxWidth: "28rem" }}>
          <h1 style={{ fontSize: "1.25rem", fontWeight: 600, marginBottom: "0.5rem" }}>
            Something went wrong
          </h1>
          <p style={{ color: "#666", marginBottom: "1.5rem" }}>
            An unexpected error occurred while loading the app.
          </p>
          <button
            onClick={() => reset()}
            style={{
              padding: "0.5rem 1rem",
              borderRadius: "0.5rem",
              border: "1px solid #ccc",
              cursor: "pointer",
              background: "white",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  )
}
