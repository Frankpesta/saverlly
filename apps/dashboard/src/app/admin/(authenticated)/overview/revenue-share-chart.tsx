"use client"

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import type { Kiosk } from "@/lib/api/types"

export function RevenueShareChart({ kiosks }: { kiosks: Kiosk[] }) {
  const data = kiosks.map((k) => ({
    name: k.name.length > 14 ? `${k.name.slice(0, 13)}…` : k.name,
    fullName: k.name,
    revenueSharePct: Number(k.revenueSharePct),
  }))

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="#e1e0d9" strokeDasharray="0" />
        <XAxis
          dataKey="name"
          tickLine={false}
          axisLine={{ stroke: "#c3c2b7" }}
          tick={{ fontSize: 12, fill: "#898781" }}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 12, fill: "#898781" }}
          tickFormatter={(v) => `${v}%`}
          width={44}
        />
        <Tooltip
          cursor={{ fill: "var(--brand-teal-tint)" }}
          formatter={(value) => [`${value}%`, "Revenue share"]}
          labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName ?? ""}
          contentStyle={{
            borderRadius: 12,
            border: "1px solid rgba(11,11,11,0.08)",
            boxShadow: "0 4px 16px rgba(11,11,11,0.08)",
            fontSize: 13,
          }}
        />
        <Bar
          dataKey="revenueSharePct"
          fill="var(--brand-teal)"
          radius={[4, 4, 0, 0]}
          maxBarSize={24}
        />
      </BarChart>
    </ResponsiveContainer>
  )
}
