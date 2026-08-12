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
  className,
}: {
  label: string
  value: number
  icon?: React.ReactNode
  format?: (value: number) => string
  className?: string
}) {
  const animated = useAnimatedNumber(value)

  return (
    <BentoCard className={cn("flex flex-col justify-between gap-4", className)}>
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        {icon && (
          <span className="flex size-8 items-center justify-center rounded-full bg-[var(--brand-teal-tint)] text-[var(--brand-teal)] [&_svg]:size-4">
            {icon}
          </span>
        )}
      </div>
      <span className="text-3xl font-semibold tracking-tight">{format(animated)}</span>
    </BentoCard>
  )
}
