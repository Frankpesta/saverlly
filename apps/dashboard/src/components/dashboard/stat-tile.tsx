"use client"

import * as React from "react"
import { animate, useMotionValue, useTransform } from "motion/react"
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
  subtext,
  className,
}: {
  label: string
  value: number
  icon?: React.ReactNode
  format?: (value: number) => string
  /** Small muted line under the value, e.g. "+12.4% this month" or "12 payouts". Omit if not derivable. */
  subtext?: React.ReactNode
  className?: string
}) {
  const animated = useAnimatedNumber(value)

  return (
    <BentoCard className={cn("group flex min-h-40 flex-col justify-between gap-5", className)}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
        {icon && (
          <span className="flex size-9 items-center justify-center rounded-xl bg-[var(--brand-teal-tint)] text-[var(--brand-teal)] transition-transform duration-200 group-hover:scale-110 [&_svg]:size-4">
            {icon}
          </span>
        )}
      </div>
      <div className="flex flex-col gap-0.5">
        <span className="text-3xl font-semibold tracking-[-0.04em]">{format(animated)}</span>
        {subtext && <span className="text-sm text-muted-foreground">{subtext}</span>}
      </div>
    </BentoCard>
  )
}
