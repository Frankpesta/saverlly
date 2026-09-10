"use client"

import * as React from "react"
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
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

/** Rendered as the Tooltip's content. Recharts measures this box and positions the wrapper
 * itself (`getTooltipTranslate`), flipping to whichever side of the cursor keeps the whole box
 * inside the chart's viewBox — so it follows the mouse without ever covering the hovered point
 * or spilling past an edge. We only need to render the box; recharts owns placement. */
function ChartTooltip({
  active,
  payload,
  valueLabel,
}: {
  active?: boolean
  payload?: { payload: Point }[]
  valueLabel: string
}) {
  if (!active || !payload?.length) return null
  const point = payload[0].payload

  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 shadow-md">
      <div className="text-heading tabular-nums">{formatCurrency(point.value)}</div>
      <div className="text-meta text-muted-foreground">
        {valueLabel} on {READOUT_DATE.format(new Date(point.date))}
      </div>
    </div>
  )
}

export function TrendChart({
  data,
  valueLabel = "Amount",
}: {
  /** Daily {date, value} series, oldest first. Pass up to 365 days so every range tab has data. */
  data: { date: string; value: number }[]
  valueLabel?: string
}) {
  const gradientId = React.useId().replace(/:/g, "")
  const [range, setRange] = React.useState<RangeLabel>("30D")
  const lastDate = data.at(-1)?.date
  const [customFrom, setCustomFrom] = React.useState("")
  const [customTo, setCustomTo] = React.useState(lastDate ?? "")

  const days = RANGES.find((r) => r.label === range)?.days
  const inCustomRange =
    range === "Custom" && (customFrom || customTo)
      ? (point: { date: string }) =>
          (!customFrom || point.date >= customFrom) && (!customTo || point.date <= customTo)
      : null

  const display = (
    days != null ? data.slice(-days) : inCustomRange ? data.filter(inCustomRange) : data
  ).map((point) => ({
    ...point,
    label: new Date(point.date).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
  }))

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Tabs value={range} onValueChange={(v) => setRange(v as RangeLabel)}>
            <TabsList aria-label="Chart date range">
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
      </div>

      <p className="text-meta text-muted-foreground">
        {display.length
          ? `${display[0].date} to ${display.at(-1)!.date}`
          : "No activity in this range"}{" "}
        · Date range applies to this chart.
      </p>
      <ResponsiveContainer width="100%" height={260}>
        <AreaChart data={display} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
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
          {/* Recharts measures ChartTooltip's rendered box and positions the wrapper itself,
              flipping sides as needed to stay inside the chart and never cover the hovered
              point (see getTooltipTranslate) — isAnimationActive off avoids transition lag
              reading as jitter when the cursor moves quickly. */}
          <Tooltip
            content={<ChartTooltip valueLabel={valueLabel} />}
            isAnimationActive={false}
            offset={12}
            cursor={{ stroke: "var(--brand-teal)", strokeWidth: 1 }}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke="var(--brand-teal)"
            strokeWidth={2}
            fill={`url(#${gradientId})`}
            isAnimationActive={false}
            activeDot={{ r: 4, fill: "var(--brand-teal)", stroke: "var(--card)", strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
