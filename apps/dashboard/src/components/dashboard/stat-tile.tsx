"use client"

import * as React from "react"
import { animate, useMotionValue, useTransform } from "motion/react"
import { ArrowDownRightIcon, ArrowUpRightIcon } from "lucide-react"
import { BentoCard } from "@/components/dashboard/bento-grid"
import { cn } from "@/lib/utils"

function useAnimatedNumber(target: number, duration = 0.8) {
  const motionValue = useMotionValue(0)
  const rounded = useTransform(motionValue, (latest) => latest)
  const [display, setDisplay] = React.useState(0)

  React.useEffect(() => {
    const controls = animate(motionValue, target, { duration, ease: "easeOut" })
    const unsubscribe = rounded.on("change", (latest) => setDisplay(latest))
    return () => {
      controls.stop()
      unsubscribe()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- motionValue/rounded are stable refs from useMotionValue/useTransform
  }, [target, duration])

  return display
}

const defaultFormat = (n: number) =>
  Intl.NumberFormat(undefined, { notation: n >= 1000 ? "compact" : "standard" }).format(
    Math.round(n),
  )

/** A sparkline needs enough real movement to mean anything. Two points is a straight line and
 * a series of identical values is a flat one; both were previously drawn anyway, which on the
 * current data produced a single meaningless spike on an otherwise empty chart. */
function isPlottable(trend: number[] | undefined): trend is number[] {
  if (!trend || trend.length < 4) return false
  return new Set(trend).size > 1
}

export function StatTile({
  label,
  value,
  icon,
  format = defaultFormat,
  delta,
  trend,
  subtext,
  className,
}: {
  label: string
  value: number
  icon?: React.ReactNode
  format?: (value: number) => string
  /** Month-over-month growth percentage, rendered as a small coloured delta. Pass null or
   *  undefined when growth is not computable rather than showing a misleading 0%. */
  delta?: number | null
  /** A real, chronological data series. The sparkline is omitted when the API cannot support
   *  one, rather than inventing a decorative trend. */
  trend?: number[]
  /** Small muted line under the value, e.g. "this month" or "12 payouts". */
  subtext?: React.ReactNode
  className?: string
}) {
  const animated = useAnimatedNumber(value)
  const hasDelta = delta !== undefined && delta !== null
  const gradientId = React.useId()
  const plottable = isPlottable(trend)

  const trendPoints = React.useMemo(() => {
    if (!plottable) return null
    const min = Math.min(...trend)
    const max = Math.max(...trend)
    const range = max - min || 1
    return trend
      .map((point, index) => `${(index / (trend.length - 1)) * 100},${28 - ((point - min) / range) * 26}`)
      .join(" ")
  }, [trend, plottable])

  return (
    <BentoCard
      variant="metric"
      className={cn("dashboard-metric-card group relative flex min-h-[9.5rem] flex-col", className)}
    >
      <div className="flex flex-1 flex-col gap-3 px-5 pt-5 pb-4">
        {/* The icon sits inline with the label on every tile, with or without a sparkline.
            It used to move into a tinted side panel whenever a trend was present, so two
            tiles in the same row had visibly different silhouettes. */}
        <div className="flex items-start justify-between gap-3">
          <span className="text-eyebrow text-muted-foreground uppercase">{label}</span>
          {icon && (
            <span className="flex shrink-0 items-center justify-center text-primary [&_svg]:size-[1.125rem]">
              {icon}
            </span>
          )}
        </div>

        <div className="mt-auto flex flex-col gap-1.5">
          <span className="text-display tabular-nums">{format(animated)}</span>
          {/* Reserved whether or not there is anything to show, so tiles with a subtext and
              tiles without still line their numbers up across a row. */}
          <div className="flex min-h-5 flex-wrap items-center gap-x-2 gap-y-1 text-meta">
            {hasDelta && (
              <span
                className={cn(
                  "inline-flex items-center gap-0.5 font-semibold",
                  delta >= 0 ? "text-[var(--success)]" : "text-destructive",
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
        </div>
      </div>

      {/* Full-bleed footer rather than a side panel, so the tile keeps one silhouette and the
          chart gets the card's full width instead of 34% of it. Always brand teal: colouring
          it off the delta sign painted a red chart across a teal dashboard. The band is
          reserved even with no series to draw, otherwise a tile without a sparkline is 40px
          shorter internally and its number sits lower than its neighbours' in the same row. */}
      <div className="h-10 shrink-0" aria-hidden>
        {trendPoints && (
          <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="size-full">
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--brand-teal)" stopOpacity="0.22" />
                <stop offset="100%" stopColor="var(--brand-teal)" stopOpacity="0" />
              </linearGradient>
            </defs>
            <polygon points={`0,30 ${trendPoints} 100,30`} fill={`url(#${gradientId})`} />
            <polyline
              fill="none"
              points={trendPoints}
              stroke="var(--brand-teal)"
              strokeWidth="1.25"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        )}
      </div>
    </BentoCard>
  )
}
