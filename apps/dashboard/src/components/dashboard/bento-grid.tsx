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
    <div className={cn("grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4", className)}>
      {children}
    </div>
  )
}

export function BentoCard({
  className,
  children,
  span = 1,
}: {
  className?: string
  children: React.ReactNode
  /** How many grid columns this card spans at the lg breakpoint (1-4). */
  span?: 1 | 2 | 3 | 4
}) {
  const spanClass = {
    1: "lg:col-span-1",
    2: "lg:col-span-2",
    3: "lg:col-span-3",
    4: "lg:col-span-4",
  }[span]

  return (
    <div
      className={cn(
        "col-span-1 rounded-2xl border border-black/[0.06] bg-card p-5 shadow-[0_1px_2px_rgba(11,11,11,0.03)] transition-all duration-200 hover:-translate-y-0.5 hover:border-black/10 hover:shadow-[0_10px_30px_rgba(11,11,11,0.06)] sm:p-6",
        spanClass,
        className,
      )}
    >
      {children}
    </div>
  )
}
