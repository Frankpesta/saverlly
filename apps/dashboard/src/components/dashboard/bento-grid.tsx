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
    <div className={cn("grid grid-cols-2 gap-4 lg:grid-cols-4", className)}>
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
        "col-span-2 rounded-2xl border border-black/8 bg-card p-6 shadow-[0_1px_2px_rgba(11,11,11,0.04)] transition-shadow hover:shadow-[0_4px_16px_rgba(11,11,11,0.06)]",
        spanClass,
        className,
      )}
    >
      {children}
    </div>
  )
}
