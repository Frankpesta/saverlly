"use client"

import * as React from "react"
import Link from "next/link"
import {
  StoreIcon,
  CircleCheckIcon,
  PercentIcon,
  ShoppingBagIcon,
  TagIcon,
  LinkIcon,
} from "lucide-react"
import { BentoCard, BentoGrid } from "@/components/dashboard/bento-grid"
import { StatTile } from "@/components/dashboard/stat-tile"
import { Meter } from "@/components/dashboard/meter"
import { Skeleton } from "@/components/ui/skeleton"
import { useKiosks } from "@/lib/api/hooks/use-kiosks"
import { relativeTime } from "@/lib/relative-time"
import { RevenueShareChart } from "./revenue-share-chart"

const COMING_SOON = [
  { title: "Merchants", description: "Merchant catalog & coupon sourcing", icon: ShoppingBagIcon },
  { title: "Coupons", description: "Success/fail rates per code", icon: TagIcon },
  { title: "Affiliate programs", description: "Network credentials & sync status", icon: LinkIcon },
]

export default function AdminOverviewPage() {
  const { data: kiosks, isLoading } = useKiosks()

  const stats = React.useMemo(() => {
    const list = kiosks ?? []
    const active = list.filter((k) => k.status === "ACTIVE").length
    const avgShare =
      list.length === 0
        ? 0
        : list.reduce((sum, k) => sum + Number(k.revenueSharePct), 0) / list.length
    return { total: list.length, active, avgShare }
  }, [kiosks])

  const recentKiosks = React.useMemo(() => {
    return [...(kiosks ?? [])]
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 6)
  }, [kiosks])

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Overview</h2>
        <p className="text-sm text-muted-foreground">
          A snapshot of everything happening across the Saverlly platform.
        </p>
      </div>

      <BentoGrid>
        <StatTile label="Total kiosks" value={stats.total} icon={<StoreIcon />} />
        <StatTile label="Active kiosks" value={stats.active} icon={<CircleCheckIcon />} />
        <StatTile
          label="Avg. revenue share"
          value={stats.avgShare}
          icon={<PercentIcon />}
          format={(n) => `${n.toFixed(1)}%`}
        />
        <Meter
          label="Kiosks active"
          value={stats.active}
          max={stats.total}
          caption={`${stats.active} of ${stats.total} kiosks active`}
        />

        <BentoCard span={3}>
          <div className="mb-2 flex flex-col gap-0.5">
            <h3 className="text-sm font-semibold">Revenue share by kiosk</h3>
            <p className="text-sm text-muted-foreground">
              What each kiosk keeps of its commission.
            </p>
          </div>
          {isLoading ? (
            <Skeleton className="h-[220px] w-full" />
          ) : (
            <RevenueShareChart kiosks={kiosks ?? []} />
          )}
        </BentoCard>

        <BentoCard>
          <div className="flex h-full flex-col gap-3">
            <h3 className="text-sm font-semibold">Recent activity</h3>
            <div className="flex flex-1 flex-col gap-3">
              {isLoading &&
                Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}
              {!isLoading && recentKiosks.length === 0 && (
                <p className="text-sm text-muted-foreground">No activity yet.</p>
              )}
              {recentKiosks.map((kiosk) => {
                const justCreated =
                  new Date(kiosk.createdAt).getTime() === new Date(kiosk.updatedAt).getTime()
                return (
                  <Link
                    key={kiosk.id}
                    href={`/admin/kiosks/${kiosk.id}`}
                    className="flex flex-col gap-0.5 rounded-lg px-2 py-1.5 -mx-2 transition-colors hover:bg-[var(--brand-teal-tint)]/50"
                  >
                    <span className="text-sm font-medium">
                      {kiosk.name} <span className="font-normal text-muted-foreground">was {justCreated ? "created" : "updated"}</span>
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {relativeTime(kiosk.updatedAt)}
                    </span>
                  </Link>
                )
              })}
            </div>
          </div>
        </BentoCard>
      </BentoGrid>

      <div>
        <h3 className="mb-3 text-sm font-semibold text-muted-foreground">Coming soon</h3>
        <BentoGrid>
          {COMING_SOON.map(({ title, description, icon: Icon }) => (
            <BentoCard key={title} className="flex flex-col gap-3 opacity-70">
              <span className="flex size-8 items-center justify-center rounded-full bg-muted text-muted-foreground [&_svg]:size-4">
                <Icon />
              </span>
              <div>
                <p className="text-sm font-medium">{title}</p>
                <p className="text-sm text-muted-foreground">{description}</p>
              </div>
            </BentoCard>
          ))}
        </BentoGrid>
      </div>
    </div>
  )
}
