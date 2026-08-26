import * as React from "react"
import { cn } from "@/lib/utils"

export function BentoGrid({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={cn("dashboard-bento-grid grid grid-cols-1 gap-5 sm:grid-cols-3 lg:grid-cols-6", className)}>
      {children}
    </div>
  )
}

export function BentoCard({
  className,
  children,
  span = 1,
  variant = "section",
}: {
  className?: string
  children: React.ReactNode
  /** How many grid columns this card spans at the lg breakpoint (1-4). */
  span?: 1 | 2 | 3 | 4
  /** Metrics need a compact surface; analytical content should sit openly on the page plane. */
  variant?: "section" | "metric"
}) {
  const spanClass = {
    1: "lg:col-span-1",
    2: "lg:col-span-2",
    3: "lg:col-span-3",
    4: "lg:col-span-4",
  }[span]

  return (
    <div
      data-slot="dashboard-surface"
      className={cn(
        variant === "metric"
          ? "col-span-1 overflow-hidden rounded-[1.15rem] border border-black/[0.05] bg-card p-5 shadow-[0_14px_36px_rgba(17,27,24,0.06)] dark:border-white/10"
          : "col-span-1 border-t border-black/[0.09] py-5 dark:border-white/10",
        spanClass,
        className,
      )}
    >
      {children}
    </div>
  )
}
