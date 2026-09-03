"use client"

import { BentoCard } from "@/components/dashboard/bento-grid"
import { cn } from "@/lib/utils"

/** A single ratio against a limit. Same shell as StatTile and Gauge so a mixed row reads as
 * one family; the difference from Gauge is only that there is no active/inactive legend. */
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
    <BentoCard
      variant="metric"
      className={cn("dashboard-metric-card flex min-h-[9.5rem] flex-col", className)}
    >
      <div className="flex flex-1 flex-col gap-3 px-5 pt-5 pb-4">
        <span className="text-eyebrow text-muted-foreground uppercase">{label}</span>
        <div className="mt-auto flex flex-col gap-1.5">
          <span className="text-display tabular-nums">{pct}%</span>
          <span className="min-h-5 text-meta text-muted-foreground">
            {caption ?? `${value} of ${max}`}
          </span>
        </div>
      </div>
      {/* Same 40px footer band as StatTile's sparkline, so numbers line up across a row that
          mixes tiles and meters. */}
      <div className="flex h-10 shrink-0 items-center px-5 pb-2">
        {/* CSS transition on scaleX rather than a motion animation on width, for the same two
            reasons as gauge.tsx: percentage widths get frozen into stale pixels, and a bar
            that mounts at 0% before its data arrives never re-animates. */}
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--brand-teal-tint)] dark:bg-white/10">
          <div
            className="h-full w-full origin-left bg-[var(--brand-teal)] transition-transform duration-700 ease-out"
            style={{ transform: `scaleX(${pct / 100})` }}
          />
        </div>
      </div>
    </BentoCard>
  )
}
