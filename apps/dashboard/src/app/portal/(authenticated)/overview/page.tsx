"use client"

import * as React from "react"
import { PercentIcon, UsersIcon, CircleCheckIcon, CirclePauseIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { BentoCard, BentoGrid } from "@/components/dashboard/bento-grid"
import { StatTile } from "@/components/dashboard/stat-tile"
import { Skeleton } from "@/components/ui/skeleton"
import { useCurrentUser } from "@/lib/api/hooks/use-current-user"
import { useKiosk } from "@/lib/api/hooks/use-kiosks"
import { useKioskUsers } from "@/lib/api/hooks/use-kiosk-users"
import { relativeTime } from "@/lib/relative-time"

const ROLE_LABEL = {
  KIOSK_OWNER: "Kiosk owner",
  LOCATION_MANAGER: "Location manager",
} as const

export default function PortalOverviewPage() {
  const { data: currentUser } = useCurrentUser()
  const kioskId = currentUser?.kioskId ?? ""
  const { data: kiosk, isLoading: kioskLoading } = useKiosk(kioskId)
  const { data: users, isLoading: usersLoading } = useKioskUsers(kioskId)

  const recent = React.useMemo(() => {
    return [...(users ?? [])]
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 6)
  }, [users])

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Overview</h2>
        <p className="text-sm text-muted-foreground">
          {kiosk ? `A snapshot of ${kiosk.name}.` : "A snapshot of your kiosk."}
        </p>
      </div>

      <BentoGrid>
        <BentoCard className="flex flex-col justify-between gap-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Status</span>
            <span className="flex size-8 items-center justify-center rounded-full bg-[var(--brand-teal-tint)] text-[var(--brand-teal)] [&_svg]:size-4">
              {kiosk?.status === "ACTIVE" ? <CircleCheckIcon /> : <CirclePauseIcon />}
            </span>
          </div>
          {kioskLoading ? (
            <Skeleton className="h-8 w-24" />
          ) : (
            <Badge
              variant={kiosk?.status === "ACTIVE" ? "default" : "secondary"}
              className="w-fit text-sm"
            >
              {kiosk?.status ?? "—"}
            </Badge>
          )}
        </BentoCard>

        <StatTile
          label="Revenue share"
          value={kiosk ? Number(kiosk.revenueSharePct) : 0}
          icon={<PercentIcon />}
          format={(n) => `${n.toFixed(1)}%`}
        />
        <StatTile label="Team members" value={users?.length ?? 0} icon={<UsersIcon />} />

        <BentoCard span={2}>
          <div className="flex h-full flex-col gap-3">
            <h3 className="text-sm font-semibold">Your team</h3>
            <div className="flex flex-1 flex-col gap-2">
              {usersLoading &&
                Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}
              {!usersLoading && (users?.length ?? 0) === 0 && (
                <p className="text-sm text-muted-foreground">No team members yet.</p>
              )}
              {users?.slice(0, 4).map((user) => (
                <div key={user.id} className="flex items-center justify-between">
                  <span className="text-sm">{user.email}</span>
                  <Badge variant="secondary">{ROLE_LABEL[user.role]}</Badge>
                </div>
              ))}
            </div>
          </div>
        </BentoCard>

        <BentoCard span={2}>
          <div className="flex h-full flex-col gap-3">
            <h3 className="text-sm font-semibold">Recent activity</h3>
            <div className="flex flex-1 flex-col gap-3">
              {usersLoading &&
                Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}
              {!usersLoading && recent.length === 0 && (
                <p className="text-sm text-muted-foreground">No activity yet.</p>
              )}
              {recent.map((user) => {
                const justCreated =
                  new Date(user.createdAt).getTime() === new Date(user.updatedAt).getTime()
                return (
                  <div key={user.id} className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium">
                      {user.email}{" "}
                      <span className="font-normal text-muted-foreground">
                        was {justCreated ? "added" : "updated"}
                      </span>
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {relativeTime(user.updatedAt)}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        </BentoCard>
      </BentoGrid>
    </div>
  )
}
