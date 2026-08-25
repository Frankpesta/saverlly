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
    <BentoCard variant="metric" className={cn("dashboard-metric-card grid min-h-40 grid-cols-[minmax(0,1fr)_minmax(10rem,38%)] overflow-hidden p-0", className)} span={2}>
      <div className="flex flex-col justify-between px-5 py-5 sm:px-6">
        <span className="text-[11px] font-bold tracking-[0.1em] text-muted-foreground uppercase">{label}</span>
        <span className="text-[2.4rem] leading-none font-semibold tracking-[-0.065em]">{pct}%</span>
        <span className="text-sm text-muted-foreground">{caption ?? `${value} of ${max}`}</span>
      </div>
      <div className="flex items-center border-l border-black/[0.055] bg-[#f8faf9] px-5">
      <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--brand-teal-tint)]">
        <motion.div
          className="h-full bg-[var(--brand-teal)]"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        />
      </div>
      </div>
    </BentoCard>
  )
}
