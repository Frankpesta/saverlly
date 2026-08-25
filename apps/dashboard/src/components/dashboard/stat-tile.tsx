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
  /** Month-over-month growth percentage (e.g. from `monthOverMonthGrowth`) — rendered as a
   *  colored delta pill (green ▲ / red ▼) next to the value. Omit or pass null/undefined when
   *  growth isn't computable (e.g. no prior-month data) rather than showing a misleading 0%. */
  delta?: number | null
  /** A real, chronological data series. A sparkline is deliberately omitted when the API
   * cannot support it, rather than inventing a decorative trend. */
  trend?: number[]
  /** Small muted line under the value/pill, e.g. "this month" or "12 payouts". */
  subtext?: React.ReactNode
  className?: string
}) {
  const animated = useAnimatedNumber(value)
  const hasDelta = delta !== undefined && delta !== null
  const gradientId = React.useId()
  const trendPoints = React.useMemo(() => {
    if (!trend || trend.length < 2) return null
    const min = Math.min(...trend)
    const max = Math.max(...trend)
    const range = max - min || 1
    return trend
      .map((point, index) => `${(index / (trend.length - 1)) * 84},${28 - ((point - min) / range) * 24}`)
      .join(" ")
  }, [trend])

  const chartColor = hasDelta && delta < 0 ? "var(--destructive)" : "var(--brand-teal)"
  const areaPoints = trendPoints ? `0,30 ${trendPoints} 84,30` : undefined

  return (
    <BentoCard
      variant="metric"
      span={2}
      className={cn("dashboard-metric-card group relative grid min-h-40 grid-cols-[minmax(0,1fr)_minmax(9rem,34%)] overflow-hidden p-0 transition-shadow duration-200 hover:shadow-[0_18px_38px_rgba(17,27,24,0.09)]", className)}
    >
      <div className="flex min-w-0 flex-col justify-between px-5 py-5 sm:px-6">
        <span className="text-[11px] font-bold tracking-[0.1em] text-muted-foreground uppercase">{label}</span>
        <div className="mt-4">
          <span className="block text-[2.25rem] leading-none font-semibold tracking-[-0.065em] sm:text-[2.55rem]">{format(animated)}</span>
          {(hasDelta || subtext) && (
            <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
              {hasDelta && <span className={cn("inline-flex items-center gap-1 font-semibold", delta >= 0 ? "text-[var(--success)]" : "text-destructive")}>{delta >= 0 ? <ArrowUpRightIcon className="size-3.5" /> : <ArrowDownRightIcon className="size-3.5" />}{Math.abs(delta).toFixed(1)}%</span>}
              {subtext && <span className="text-muted-foreground">{subtext}</span>}
            </div>
          )}
        </div>
      </div>
      <div className="relative min-h-full border-l border-black/[0.055] bg-[#f8faf9]">
        {icon && <span className="absolute right-4 top-4 flex size-9 items-center justify-center rounded-lg bg-white text-muted-foreground shadow-[0_2px_8px_rgba(17,27,24,0.04)] [&_svg]:size-4">{icon}</span>}
        {trendPoints && (
          <div className="absolute inset-x-3 bottom-4 h-[54%]">
            <svg viewBox="0 0 84 30" preserveAspectRatio="none" aria-label={`${label} trend`} role="img" className="size-full overflow-visible">
              <defs><linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={chartColor} stopOpacity="0.25" /><stop offset="100%" stopColor={chartColor} stopOpacity="0" /></linearGradient></defs>
              <polygon points={areaPoints} fill={`url(#${gradientId})`} />
              <polyline fill="none" points={trendPoints} stroke={chartColor} strokeWidth="0.9" vectorEffect="non-scaling-stroke" />
            </svg>
          </div>
        )}
      </div>
    </BentoCard>
  )
}
