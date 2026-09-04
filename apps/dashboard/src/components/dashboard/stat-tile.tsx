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
  /** Small muted line under the value, e.g. "this month" or "12 payouts". */
  subtext?: React.ReactNode
  className?: string
}) {
  const animated = useAnimatedNumber(value)
  const hasDelta = delta !== undefined && delta !== null

  return (
    <BentoCard
      variant="metric"
      className={cn("dashboard-metric-card flex flex-col gap-4 p-5", className)}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="text-eyebrow text-muted-foreground uppercase">{label}</span>
        {icon && (
          <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--brand-teal-tint)] text-[var(--brand-teal)] [&_svg]:size-5">
            {icon}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-display tabular-nums">{format(animated)}</span>
        {(hasDelta || subtext) && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-meta">
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
        )}
      </div>
    </BentoCard>
  )
}
