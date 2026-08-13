"use client"

import * as React from "react"
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { formatCurrency } from "@/lib/format-currency"

const RANGES = [
  { label: "7D", days: 7 },
  { label: "30D", days: 30 },
  { label: "3M", days: 90 },
  { label: "6M", days: 182 },
  { label: "1Y", days: 365 },
] as const

type RangeLabel = (typeof RANGES)[number]["label"]

const compactCurrency = (value: number) =>
  `$${new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(value)}`

export function TrendChart({
  data,
  valueLabel = "Amount",
}: {
  /** Daily {date, value} series, oldest first. Pass up to 365 days so every range tab has data. */
  data: { date: string; value: number }[]
  valueLabel?: string
}) {
  const [range, setRange] = React.useState<RangeLabel>("30D")
  const days = RANGES.find((r) => r.label === range)?.days ?? 30
  const display = data.slice(-days).map((point) => ({
    ...point,
    label: new Date(point.date).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
  }))

  return (
    <div className="flex flex-col gap-3">
      <Tabs value={range} onValueChange={(v) => setRange(v as RangeLabel)}>
        <TabsList>
          {RANGES.map((r) => (
            <TabsTrigger key={r.label} value={r.label}>
              {r.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <ResponsiveContainer width="100%" height={260}>
        <AreaChart data={display} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--brand-teal)" stopOpacity={0.25} />
              <stop offset="100%" stopColor="var(--brand-teal)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="#e1e0d9" strokeDasharray="0" />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={{ stroke: "#c3c2b7" }}
            tick={{ fontSize: 12, fill: "#898781" }}
            minTickGap={32}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 12, fill: "#898781" }}
            tickFormatter={compactCurrency}
            width={56}
          />
          <Tooltip
            cursor={{ stroke: "var(--brand-teal)", strokeWidth: 1 }}
            formatter={(value) => [formatCurrency(Number(value)), valueLabel]}
            contentStyle={{
              borderRadius: 12,
              border: "1px solid rgba(11,11,11,0.08)",
              boxShadow: "0 4px 16px rgba(11,11,11,0.08)",
              fontSize: 13,
            }}
          />
          <Area type="monotone" dataKey="value" stroke="var(--brand-teal)" strokeWidth={2} fill="url(#trend-fill)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
