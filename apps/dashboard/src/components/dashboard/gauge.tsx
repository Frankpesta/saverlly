"use client"

import { motion } from "motion/react"
import { BentoCard } from "@/components/dashboard/bento-grid"
import { cn } from "@/lib/utils"

/** Operational health is easier to scan as an active/inactive distribution than a decorative
 * dial. Keep the export name for route compatibility while replacing the visual language. */
export function Gauge({
  label,
  value,
  max,
  caption,
  className,
}: {
  label: string
  value: number
  max: number
  caption?: string
  className?: string
}) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0
  const inactive = Math.max(0, max - value)

  return (
    <BentoCard variant="metric" span={2} className={cn("dashboard-metric-card grid min-h-40 grid-cols-[minmax(0,1fr)_minmax(10rem,38%)] overflow-hidden p-0", className)}>
      <div className="flex flex-col justify-between px-5 py-5 sm:px-6">
        <p className="text-[11px] font-bold tracking-[0.1em] text-muted-foreground uppercase">{label}</p>
        <p className="text-[2.4rem] leading-none font-semibold tracking-[-0.065em]">{pct}%</p>
        {caption && <p className="text-sm text-muted-foreground">{caption}</p>}
      </div>
      <div className="flex flex-col justify-center border-l border-black/[0.055] bg-[#f8faf9] px-5 dark:border-white/[0.06] dark:bg-white/[0.03]">
        <div className="flex h-2 overflow-hidden rounded-full bg-[#edf1ef] dark:bg-white/10">
          <motion.span className="bg-[var(--brand-teal)]" initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.65, ease: "easeOut" }} />
        </div>
        <div className="mt-4 flex flex-col gap-2 text-xs">
          <span className="flex items-center gap-1.5 text-muted-foreground"><i className="size-2 rounded-full bg-[var(--brand-teal)]" />{value} active</span>
          <span className="flex items-center gap-1.5 text-muted-foreground"><i className="size-2 rounded-full bg-[#cbd3d0] dark:bg-white/25" />{inactive} inactive</span>
        </div>
      </div>
    </BentoCard>
  )
}
