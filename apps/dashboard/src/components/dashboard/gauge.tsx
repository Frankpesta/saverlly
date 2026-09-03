"use client"

import { BentoCard } from "@/components/dashboard/bento-grid"
import { cn } from "@/lib/utils"

/** Operational health as an active/inactive distribution. Shares StatTile's shell exactly:
 * eyebrow, big number, meta row, full-bleed footer. Previously this was a split card with a
 * tinted right panel holding the bar and a stacked legend, which squeezed the left column
 * hard enough to wrap "KIOSKS ACTIVE" onto two lines and "7 of 7 kiosks active" onto three,
 * and made it read as a different kind of object from the tiles beside it. */
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
    <BentoCard
      variant="metric"
      className={cn("dashboard-metric-card flex min-h-[9.5rem] flex-col", className)}
    >
      <div className="flex flex-1 flex-col gap-3 px-5 pt-5 pb-4">
        <span className="text-eyebrow text-muted-foreground uppercase">{label}</span>
        <div className="mt-auto flex flex-col gap-1.5">
          <span className="text-display tabular-nums">{pct}%</span>
          {/* Legend runs inline here instead of stacking in a side panel, which is what made
              the old layout wrap. Same slot StatTile uses for its delta and subtext. */}
          <div className="flex min-h-5 flex-wrap items-center gap-x-3 gap-y-1 text-meta text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <i className="size-1.5 rounded-full bg-[var(--brand-teal)]" />
              {value} active
            </span>
            <span className="inline-flex items-center gap-1.5">
              <i className="size-1.5 rounded-full bg-[#cbd3d0] dark:bg-white/25" />
              {inactive} inactive
            </span>
          </div>
        </div>
      </div>
      {/* Same 40px footer band as StatTile's sparkline, so numbers line up across a row that
          mixes tiles and gauges. */}
      <div className="flex h-10 shrink-0 items-center px-5 pb-2" aria-label={caption ?? `${value} of ${max}`}>
        {/* A CSS transition on scaleX, not a motion animation on width. Two bugs came out of
            the old version: motion resolves a percentage width to pixels when the animation
            starts, so a bar whose container was still settling kept the stale value (a 100%
            gauge rendered 263px wide in a 392px track), and because these percentages arrive
            after the data loads, motion mounted at pct=0 and never re-ran, leaving scaleX at
            0 forever. A transform plus a transition has neither problem: it is resolution
            independent and it re-animates whenever the value changes. */}
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--brand-teal-tint)] dark:bg-white/10">
          <span
            className="block h-full w-full origin-left bg-[var(--brand-teal)] transition-transform duration-700 ease-out"
            style={{ transform: `scaleX(${pct / 100})` }}
          />
        </div>
      </div>
    </BentoCard>
  )
}
