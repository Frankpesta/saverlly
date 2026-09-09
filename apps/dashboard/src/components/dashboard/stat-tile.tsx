"use client"

import * as React from "react"
import { ArrowDownRightIcon, ArrowUpRightIcon } from "lucide-react"
import { BentoCard } from "@/components/dashboard/bento-grid"
import { cn } from "@/lib/utils"

const defaultFormat = (n: number) =>
  Intl.NumberFormat(undefined, { notation: n >= 1000 ? "compact" : "standard" }).format(
    Math.round(n),
  )

export function StatTile({
  label,
  value,
  icon,
  format = defaultFormat,
  delta,
  subtext,
  className,
  isLoading = false,
  isError = false,
}: {
  label: string
  value: number
  icon?: React.ReactNode
  format?: (value: number) => string
  /** Month-over-month growth percentage, rendered as a small coloured delta. Pass null or
   *  undefined when growth is not computable rather than showing a misleading 0%. */
  delta?: number | null
  /** Small muted line under the value, e.g. "this month" or "12 payouts". */
  subtext?: React.ReactNode
  className?: string
  isLoading?: boolean
  isError?: boolean
}) {
  const hasDelta = !isLoading && !isError && delta !== undefined && delta !== null

  return (
    <BentoCard
      variant="metric"
      className={cn("dashboard-metric-card flex flex-col gap-3 p-4 sm:p-5", className)}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="text-label text-muted-foreground">{label}</span>
        {icon && (
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[var(--brand-teal-tint)] text-[var(--brand-ink)] [&_svg]:size-4">
            {icon}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-title break-words tabular-nums sm:text-display" aria-busy={isLoading}>{isLoading ? "…" : isError ? "Unavailable" : format(value)}</span>
        {(hasDelta || subtext) && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-meta">
            {hasDelta && (
              <span
                className={cn(
                  "inline-flex items-center gap-0.5 font-semibold",
                  delta >= 0 ? "text-[var(--success-foreground)]" : "text-destructive",
                )}
              >
                {delta >= 0 ? (
                  <ArrowUpRightIcon className="size-3.5" />
                ) : (
                  <ArrowDownRightIcon className="size-3.5" />
                )}
                {Math.abs(delta).toFixed(1)}%
              </span>
            )}
            {subtext && <span className="text-muted-foreground">{subtext}</span>}
          </div>
        )}
      </div>
    </BentoCard>
  )
}
