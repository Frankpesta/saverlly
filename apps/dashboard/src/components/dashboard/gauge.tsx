"use client"

import { PolarAngleAxis, RadialBar, RadialBarChart } from "recharts"
import { BentoCard } from "@/components/dashboard/bento-grid"
import { cn } from "@/lib/utils"

const RING_SIZE = 104
const BAR_SIZE = 10

/** Operational health as an active/inactive distribution, drawn as a ring rather than a flat
 * number + linear bar — the same brand-teal-on-tint colouring, just as a proper chart instead
 * of a fixed-height rectangle. `background` on RadialBar draws the full-circle track; the bar
 * itself is the single "value" segment, so this needs no second series for "inactive". */
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
  const data = [{ value: pct }]

  return (
    <BentoCard
      variant="metric"
      className={cn("dashboard-metric-card flex min-h-[11rem] flex-col gap-4 p-5", className)}
    >
      <span className="text-eyebrow text-muted-foreground uppercase">{label}</span>
      <div className="flex flex-1 items-center gap-5">
        <div
          className="relative shrink-0"
          style={{ width: RING_SIZE, height: RING_SIZE }}
          role="img"
          aria-label={caption ?? `${pct}%, ${value} of ${max}`}
        >
          <RadialBarChart
            width={RING_SIZE}
            height={RING_SIZE}
            data={data}
            startAngle={90}
            endAngle={-270}
            innerRadius="78%"
            outerRadius="100%"
            barSize={BAR_SIZE}
          >
            <PolarAngleAxis type="number" domain={[0, 100]} tick={false} axisLine={false} />
            <RadialBar
              dataKey="value"
              cornerRadius={BAR_SIZE / 2}
              fill="var(--brand-teal)"
              background={{ fill: "var(--brand-teal-tint)" }}
              isAnimationActive={false}
            />
          </RadialBarChart>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-heading tabular-nums">{pct}%</span>
          </div>
        </div>

        <div className="flex flex-col gap-2 text-meta text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <i className="size-1.5 shrink-0 rounded-full bg-[var(--brand-teal)]" />
            {value} active
          </span>
          <span className="inline-flex items-center gap-1.5">
            <i className="size-1.5 shrink-0 rounded-full bg-[#cbd3d0] dark:bg-white/25" />
            {inactive} inactive
          </span>
        </div>
      </div>
    </BentoCard>
  )
}
