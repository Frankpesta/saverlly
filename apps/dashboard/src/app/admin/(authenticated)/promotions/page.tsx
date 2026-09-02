"use client"

import * as React from "react"
import Link from "next/link"
import { PlusIcon } from "lucide-react"
import { buttonVariants } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { usePromotions } from "@/lib/api/hooks/use-promotions"
import { cn } from "@/lib/utils"
import { PromotionCard } from "./promotion-card"
import { PromotionsEmptyState } from "./promotions-empty-state"
import { promotionStatus, type PromotionStatus } from "./promotion-status"

const FILTERS = ["All", "Live", "Scheduled", "Paused", "Ended"] as const
type Filter = (typeof FILTERS)[number]

export default function AdminPromotionsPage() {
  const { data: promotions, isLoading, isError } = usePromotions()
  const [filter, setFilter] = React.useState<Filter>("All")

  // Status is time-derived, so it has to be recomputed as the clock crosses a start/end
  // boundary — not just when the query refetches.
  const [now, setNow] = React.useState(() => Date.now())
  React.useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(interval)
  }, [])

  const withStatus = React.useMemo(
    () => (promotions ?? []).map((p) => ({ promotion: p, status: promotionStatus(p, now) })),
    [promotions, now],
  )

  const counts = React.useMemo(() => {
    const tally: Record<PromotionStatus, number> = { Live: 0, Scheduled: 0, Paused: 0, Ended: 0 }
    for (const { status } of withStatus) tally[status] += 1
    return tally
  }, [withStatus])

  const visible = React.useMemo(
    () => (filter === "All" ? withStatus : withStatus.filter((p) => p.status === filter)),
    [withStatus, filter],
  )

  function countFor(f: Filter): number {
    return f === "All" ? withStatus.length : counts[f]
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Promotions</h2>
          <p className="text-sm text-muted-foreground">
            Sponsored creatives shown inside the Saverlly Chrome extension.
          </p>
        </div>
        <Link href="/admin/promotions/new" className={cn(buttonVariants(), "gap-1.5")}>
          <PlusIcon className="size-4" />
          New Promotion
        </Link>
      </div>

      {/* A single quiet filter rail instead of a row of stat tiles — the counts and the filtering
          are the same information, so they're the same control rather than two stacked bands. */}
      <div className="flex flex-wrap items-center gap-1 border-b border-black/8 pb-px dark:border-white/10">
        {FILTERS.map((f) => {
          const isActive = filter === f
          const count = countFor(f)
          return (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              aria-pressed={isActive}
              className={cn(
                "relative -mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition-colors",
                isActive
                  ? "border-[var(--brand-teal)] font-medium text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {f}
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[11px] tabular-nums",
                  isActive ? "bg-[var(--brand-teal-tint)] text-foreground" : "bg-muted",
                )}
              >
                {count}
              </span>
            </button>
          )
        })}
      </div>

      {isError && <p className="text-sm text-destructive">Could not load promotions.</p>}

      {isLoading && (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="overflow-hidden rounded-2xl border border-black/8 dark:border-white/10">
              <Skeleton className="w-full" style={{ aspectRatio: "320 / 100" }} />
              <div className="flex flex-col gap-2 p-4">
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            </div>
          ))}
        </div>
      )}

      {!isLoading && withStatus.length === 0 && <PromotionsEmptyState />}

      {!isLoading && withStatus.length > 0 && visible.length === 0 && (
        <p className="py-12 text-center text-sm text-muted-foreground">
          No {filter.toLowerCase()} promotions right now.
        </p>
      )}

      {visible.length > 0 && (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map(({ promotion }) => (
            <PromotionCard key={promotion.id} promotion={promotion} now={now} />
          ))}
        </div>
      )}
    </div>
  )
}
