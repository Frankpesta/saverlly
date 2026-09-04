import * as React from "react"
import { cn } from "@/lib/utils"

/** Column count per number of tiles, chosen so the last row is always full. The old fixed
 * 6-column grid with per-child spans could not do this: a page with 2 stat tiles (affiliate
 * programs, coupons, scrape sources) spanned 4 of 6 columns and left a third of the row as
 * dead whitespace, and a page with 4 tiles (earnings, both portal overview grids) wrapped to
 * 3 + 1 and left two orphan columns. Deriving the column count from the child count removes
 * the whole class of bug rather than asking every call site to do the arithmetic. */
const COLUMNS_FOR_COUNT: Record<number, string> = {
  1: "lg:grid-cols-1",
  2: "lg:grid-cols-2",
  3: "lg:grid-cols-3",
  4: "lg:grid-cols-4",
  5: "lg:grid-cols-5",
  6: "lg:grid-cols-3",
}

export function BentoGrid({
  className,
  columns,
  children,
}: {
  className?: string
  /** Override the derived column count. Only needed when children are conditional and the
   * rendered count differs from the intended layout. */
  columns?: 1 | 2 | 3 | 4 | 5
  children: React.ReactNode
}) {
  const count = React.Children.toArray(children).length
  const columnClass = columns
    ? COLUMNS_FOR_COUNT[columns]
    : (COLUMNS_FOR_COUNT[count] ?? "lg:grid-cols-4")

  return (
    <div
      className={cn(
        "dashboard-bento-grid grid grid-cols-1 gap-6 sm:grid-cols-2",
        columnClass,
        className,
      )}
    >
      {children}
    </div>
  )
}

const SPAN_CLASS = {
  1: "lg:col-span-1",
  2: "lg:col-span-2",
  3: "lg:col-span-3",
  4: "lg:col-span-4",
} as const

export function BentoCard({
  className,
  children,
  span = 1,
  variant = "section",
}: {
  className?: string
  children: React.ReactNode
  /** Columns this card spans at the lg breakpoint. Inside a BentoGrid leave this at 1 and let
   * the grid derive its own column count; the prop is for the ad-hoc grid-cols-2/3 sections
   * on the overview pages, where a card genuinely needs to be wider than its neighbour. */
  span?: 1 | 2 | 3 | 4
  /** Metrics need a compact surface; analytical content should sit openly on the page plane. */
  variant?: "section" | "metric"
}) {
  return (
    <div
      data-slot="dashboard-surface"
      className={cn(
        variant === "metric"
          ? "col-span-1 overflow-hidden rounded-2xl border border-black/6 bg-card shadow-xs dark:border-white/10"
          : "col-span-1 border-t border-black/9 py-5 dark:border-white/10",
        SPAN_CLASS[span],
        className,
      )}
    >
      {children}
    </div>
  )
}
