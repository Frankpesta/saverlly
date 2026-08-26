import * as React from "react"
import { cn } from "@/lib/utils"

export function WorkspaceHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: string
  title: string
  description: string
  actions?: React.ReactNode
  className?: string
}) {
  return (
    <header className={cn("flex flex-col gap-4 border-b border-black/[0.09] dark:border-white/10 pb-6 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="max-w-2xl">
        {eyebrow && <p className="mb-2 text-[11px] font-bold tracking-[0.14em] text-[var(--brand-teal-deep)] uppercase">{eyebrow}</p>}
        <h1 className="text-3xl font-semibold tracking-[-0.045em] text-foreground">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  )
}

export function CollectionSummary({
  items,
  className,
}: {
  items: { label: string; value: React.ReactNode; detail?: string }[]
  className?: string
}) {
  return (
    <dl className={cn("grid divide-y divide-black/[0.07] dark:divide-white/10 border-y border-black/[0.09] dark:border-white/10 sm:grid-cols-3 sm:divide-x sm:divide-y-0", className)}>
      {items.map((item) => (
        <div key={item.label} className="min-w-0 py-4 sm:px-5 sm:first:pl-0 sm:last:pr-0">
          <dt className="text-[11px] font-bold tracking-[0.1em] text-muted-foreground uppercase">{item.label}</dt>
          <dd className="mt-1.5 text-2xl font-semibold tracking-[-0.045em] text-foreground">{item.value}</dd>
          {item.detail && <p className="mt-0.5 text-xs text-muted-foreground">{item.detail}</p>}
        </div>
      ))}
    </dl>
  )
}

export function CollectionArea({
  title,
  description,
  count,
  children,
  className,
}: {
  title: string
  description: string
  count?: number
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={cn("flex flex-col gap-4", className)} aria-labelledby={`${title.toLowerCase().replace(/\s+/g, "-")}-heading`}>
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 id={`${title.toLowerCase().replace(/\s+/g, "-")}-heading`} className="text-base font-semibold tracking-[-0.02em]">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
        {count !== undefined && <span className="shrink-0 text-sm tabular-nums text-muted-foreground">{count} total</span>}
      </div>
      {children}
    </section>
  )
}
