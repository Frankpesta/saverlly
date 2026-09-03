"use client"

import * as React from "react"
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { DateRangePicker } from "@/components/dashboard/date-picker"
import { formatCurrency } from "@/lib/format-currency"

const RANGES = [
  { label: "7D", days: 7 },
  { label: "30D", days: 30 },
  { label: "3M", days: 90 },
  { label: "6M", days: 182 },
  { label: "1Y", days: 365 },
  { label: "Custom", days: null },
] as const

type RangeLabel = (typeof RANGES)[number]["label"]

const compactCurrency = (value: number) =>
  `$${new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(value)}`

const READOUT_DATE = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
})

type Point = { date: string; value: number; label: string }

/** Rendered as the Tooltip's content, draws nothing, and reports the hovered point upward.
 *
 * Recharts only tells you what is under the cursor through the tooltip's own render path.
 * The chart-level onMouseMove does not carry activeTooltipIndex in recharts 3.x, which is why
 * an earlier attempt left the readout stuck on the last point. Reporting from an effect keeps
 * the parent's setState out of this component's render. */
function ReadoutProbe({
  active,
  payload,
  onPoint,
}: {
  active?: boolean
  payload?: { payload: Point }[]
  onPoint: (point: Point | null) => void
}) {
  const point = active && payload?.length ? payload[0].payload : null
  const key = point ? point.date : null

  React.useEffect(() => {
    onPoint(point)
    // Keyed on the date rather than the object, which recharts recreates every mousemove and
    // would otherwise re-fire this effect on every pixel of travel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return null
}

export function TrendChart({
  data,
  valueLabel = "Amount",
}: {
  /** Daily {date, value} series, oldest first. Pass up to 365 days so every range tab has data. */
  data: { date: string; value: number }[]
  valueLabel?: string
}) {
  const [range, setRange] = React.useState<RangeLabel>("30D")
  const lastDate = data.at(-1)?.date
  const [customFrom, setCustomFrom] = React.useState("")
  const [customTo, setCustomTo] = React.useState(lastDate ?? "")
  const [hovered, setHovered] = React.useState<Point | null>(null)

  const days = RANGES.find((r) => r.label === range)?.days
  const inCustomRange =
    range === "Custom" && (customFrom || customTo)
      ? (point: { date: string }) =>
          (!customFrom || point.date >= customFrom) && (!customTo || point.date <= customTo)
      : null

  const display = (days != null ? data.slice(-days) : inCustomRange ? data.filter(inCustomRange) : data).map(
    (point) => ({
      ...point,
      label: new Date(point.date).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    }),
  )

  // The readout falls back to the most recent point, so the header carries a real number even
  // before the cursor enters the chart, rather than appearing and disappearing on hover.
  const readout = hovered ?? display.at(-1)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Tabs value={range} onValueChange={(v) => setRange(v as RangeLabel)}>
            <TabsList>
              {RANGES.map((r) => (
                <TabsTrigger key={r.label} value={r.label}>
                  {r.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          {range === "Custom" && (
            <DateRangePicker
              value={{ from: customFrom, to: customTo }}
              onChange={(next) => {
                setCustomFrom(next.from)
                setCustomTo(next.to)
              }}
            />
          )}
        </div>

        {/* Pinned readout. The recharts default tooltip is a box that tracks the cursor, which
            jitters, covers the point being inspected, and re-anchors when it nears an edge.
            The client flagged that twice. Parking the values here removes the positioning
            problem entirely instead of tuning it, and the chart keeps only a cursor line. */}
        {readout && (
          <div className="flex flex-col items-end leading-tight" aria-live="polite">
            <span className="text-heading tabular-nums">{formatCurrency(readout.value)}</span>
            <span className="text-meta text-muted-foreground">
              {valueLabel} on {READOUT_DATE.format(new Date(readout.date))}
            </span>
          </div>
        )}
      </div>

      <ResponsiveContainer width="100%" height={260}>
        <AreaChart
          data={display}
          margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
          onMouseLeave={() => setHovered(null)}
        >
          <defs>
            <linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--brand-teal)" stopOpacity={0.25} />
              <stop offset="100%" stopColor="var(--brand-teal)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="0" />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={{ stroke: "var(--border)" }}
            tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
            minTickGap={32}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
            tickFormatter={compactCurrency}
            width={56}
          />
          {/* Kept only for its cursor line. Rendering null content means recharts draws the
              vertical rule and positions nothing, so there is no floating box at all.
              isAnimationActive off stops the line easing in from its last position when the
              pointer re-enters the plot. */}
          <Tooltip
            content={<ReadoutProbe onPoint={setHovered} />}
            isAnimationActive={false}
            cursor={{ stroke: "var(--brand-teal)", strokeWidth: 1 }}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke="var(--brand-teal)"
            strokeWidth={2}
            fill="url(#trend-fill)"
            isAnimationActive={false}
            activeDot={{ r: 4, fill: "var(--brand-teal)", stroke: "var(--card)", strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
