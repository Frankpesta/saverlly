"use client"

import { useEffect } from "react"
import * as Sentry from "@sentry/nextjs"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console -- the one place a raw console.error is the right
    // call: this is the last line of defense once a render has already thrown, and there is
    // no request/response cycle left to route through the backend's structured logger.
    console.error(error)
    // No-op until NEXT_PUBLIC_SENTRY_DSN is set (see instrumentation-client.ts).
    Sentry.captureException(error)
  }, [error])

  const homeHref =
    typeof window !== "undefined" && window.location.pathname.startsWith("/admin")
      ? "/admin/overview"
      : "/portal/overview"

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Something went wrong</CardTitle>
          <CardDescription>
            An unexpected error occurred. You can try again, or head back to the
            dashboard.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex gap-2">
          <Button onClick={() => reset()}>Try again</Button>
          <Button variant="outline" asChild>
            <a href={homeHref}>Go to dashboard</a>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
