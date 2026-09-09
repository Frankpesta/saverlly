"use client"

import type { ReactNode } from "react"
import { RefreshCwIcon, TriangleAlertIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"

export function QueryBoundary({
  queries,
  children,
  label,
}: {
  queries: { isLoading: boolean; isError: boolean; refetch: () => unknown }[]
  children: ReactNode
  label: string
}) {
  const failures = queries.filter((query) => query.isError)
  if (failures.length)
    return (
      <InlineQueryError
        message={`Could not load ${label}. Please try again.`}
        onRetry={() => failures.forEach((query) => query.refetch())}
      />
    )
  if (queries.some((query) => query.isLoading))
    return (
      <div role="status" aria-label={`Loading ${label}`} className="flex flex-col gap-5">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
        <span className="sr-only">Loading {label}…</span>
      </div>
    )
  return children
}

export function InlineQueryError({
  message,
  onRetry,
}: {
  message: string
  onRetry?: () => unknown
}) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-3 rounded-lg border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm"
    >
      <TriangleAlertIcon aria-hidden className="size-4 shrink-0 text-destructive" />
      <p className="min-w-0 flex-1">{message}</p>
      {onRetry && (
        <Button type="button" variant="outline" size="sm" onClick={() => onRetry()}>
          <RefreshCwIcon />
          Try again
        </Button>
      )}
    </div>
  )
}
