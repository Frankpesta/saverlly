"use client"

import { motion } from "motion/react"
import { BentoCard } from "@/components/dashboard/bento-grid"
import { cn } from "@/lib/utils"

export function Meter({
  label,
  value,
  max,
  caption,
  className,
}: {
  label: string
  value: number
  max: number
  /** Overrides the default "value of max" caption, e.g. "3 of 4 active". */
  caption?: string
  className?: string
}) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0

  return (
    <BentoCard className={cn("flex min-h-40 flex-col justify-between gap-5", className)} span={2}>
      <div className="flex items-baseline justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className="text-sm font-medium text-foreground">{pct}%</span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-[var(--brand-teal-tint)] ring-1 ring-inset ring-[var(--brand-teal-soft)]">
        <motion.div
          className="h-full rounded-full bg-[var(--brand-teal)]"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        />
      </div>
      <span className="text-sm text-muted-foreground">
        {caption ?? `${value} of ${max}`}
      </span>
    </BentoCard>
  )
}
