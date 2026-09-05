"use client"

import * as React from "react"
import Link from "next/link"
import {
  WalletIcon,
  ClockIcon,
  TrendingUpIcon,
  CreditCardIcon,
  MapPinIcon,
  MonitorIcon,
  ReceiptIcon,
  CircleCheckIcon,
  CirclePauseIcon,
  MegaphoneIcon,
  PlusIcon,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { BentoCard, BentoGrid } from "@/components/dashboard/bento-grid"
import { StatTile } from "@/components/dashboard/stat-tile"
import { Meter } from "@/components/dashboard/meter"
import { TrendChart } from "@/components/dashboard/trend-chart"
import { useCurrentUser } from "@/lib/api/hooks/use-current-user"
import { useKiosk } from "@/lib/api/hooks/use-kiosks"
import { useMyBalance, useMyCommissionEvents } from "@/lib/api/hooks/use-commissions"
import { useMyPayouts } from "@/lib/api/hooks/use-payouts"
import { useLocations } from "@/lib/api/hooks/use-locations"
import { useDevices } from "@/lib/api/hooks/use-devices"
import { useAnnouncements } from "@/lib/api/hooks/use-announcements"
import { formatCurrency } from "@/lib/format-currency"
import { relativeTime } from "@/lib/relative-time"
import { bucketByDay, deviceCounts, formatGrowthPct, monthOverMonthGrowth } from "@/lib/dashboard/aggregate"
import {
  COMMISSION_STATUS_BADGE_VARIANT,
  COMMISSION_STATUS_LABEL,
  KIOSK_STATUS_BADGE_VARIANT,
  KIOSK_STATUS_LABEL,
  PAYOUT_STATUS_BADGE_VARIANT,
  PAYOUT_STATUS_LABEL,
} from "@/lib/dashboard/status-labels"
import { cn } from "@/lib/utils"

function greeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return "Good morning"
  if (hour < 18) return "Good afternoon"
  return "Good evening"
}

export default function PortalOverviewPage() {
  const { data: currentUser } = useCurrentUser()
  const isKioskOwner = currentUser?.role === "KIOSK_OWNER"
  const kioskId = currentUser?.kioskId ?? ""
  const { data: kiosk, isLoading: kioskLoading } = useKiosk(kioskId)
  const { data: balance } = useMyBalance({ enabled: isKioskOwner })
  const { data: events, isLoading: eventsLoading } = useMyCommissionEvents({ enabled: isKioskOwner })
  const { data: payouts, isLoading: payoutsLoading } = useMyPayouts({ enabled: isKioskOwner })
  const { data: locations, isLoading: locationsLoading } = useLocations()
  const { data: devices, isLoading: devicesLoading } = useDevices()
  const { data: announcements, isLoading: announcementsLoading } = useAnnouncements()

  const confirmedEvents = React.useMemo(
    () => (events ?? []).filter((e) => e.status === "CONFIRMED"),
    [events],
  )

  const totalEarnings = React.useMemo(
    () => confirmedEvents.reduce((sum, e) => sum + e.kioskShareAmount, 0),
    [confirmedEvents],
  )

  const paidPayouts = React.useMemo(
    () => (payouts ?? []).filter((p) => p.status === "paid"),
    [payouts],
  )
  const totalPaidOut = React.useMemo(
    () => paidPayouts.reduce((sum, p) => sum + p.totalAmount, 0),
    [paidPayouts],
  )

  const eventsGrowthLabel = React.useMemo(
    () => formatGrowthPct(monthOverMonthGrowth(events ?? [], (e) => e.reportedAt, () => 1)),
    [events],
  )

  const chartSeries = React.useMemo(
    () =>
      bucketByDay(
        confirmedEvents,
        (e) => e.confirmedAt ?? e.reportedAt,
        (e) => e.kioskShareAmount,
        365,
      ),
    [confirmedEvents],
  )

  const deviceStats = React.useMemo(() => deviceCounts(devices ?? []), [devices])

  const deviceLabelById = React.useMemo(() => {
    const map = new Map<string, string>()
    for (const d of devices ?? []) map.set(d.id, d.label)
    return map
  }, [devices])

  const devicesByLocation = React.useMemo(() => {
    const map = new Map<string, { locationId: string; name: string; active: number; total: number }>()
    for (const location of locations ?? []) {
      map.set(location.id, { locationId: location.id, name: location.name, active: 0, total: 0 })
    }
    for (const device of devices ?? []) {
      const entry = map.get(device.locationId)
      if (!entry) continue
      entry.total += 1
      if (device.active) entry.active += 1
    }
    return Array.from(map.values())
  }, [locations, devices])

  const recentCommissions = React.useMemo(
    () =>
      [...(events ?? [])]
        .sort((a, b) => new Date(b.reportedAt).getTime() - new Date(a.reportedAt).getTime())
        .slice(0, 5),
    [events],
  )

  const recentPayouts = React.useMemo(
    () =>
      [...(payouts ?? [])]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 5),
    [payouts],
  )

  const recentAnnouncements = React.useMemo(
    () =>
      [...(announcements ?? [])]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 3),
    [announcements],
  )

  const displayName = currentUser?.name || currentUser?.email.split("@")[0] || "there"

  return (
    <div className="flex flex-col gap-10">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-title">
            {greeting()}, {displayName}
          </h2>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            {kioskLoading ? (
              <Skeleton className="h-5 w-16" />
            ) : (
              <Badge variant={kiosk ? KIOSK_STATUS_BADGE_VARIANT[kiosk.status] : "secondary"}>
                {kiosk ? KIOSK_STATUS_LABEL[kiosk.status] : "Unknown"}
              </Badge>
            )}
            {kiosk?.name && <span>{kiosk.name}</span>}
            <span>·</span>
            <span>{locations?.length ?? 0} locations</span>
            <span>·</span>
            <span>{deviceStats.active} active devices</span>
          </div>
        </div>
        <div className="shrink-0">
          {isKioskOwner && (
            <Link href="/portal/locations/new" className={cn(buttonVariants(), "gap-1.5")}>
              <PlusIcon className="size-4" />
              New Location
            </Link>
          )}
        </div>
      </div>

      {isKioskOwner && (
        <section className="flex flex-col gap-4">
          <div>
            <h3 className="text-heading">Earnings</h3>
          </div>
          <BentoGrid>
          <StatTile
            label="Available balance"
            value={balance?.confirmedAvailableAmount ?? 0}
            format={formatCurrency}
            icon={<WalletIcon />}
          />
          <StatTile
            label="Pending balance"
            value={balance?.pendingAmount ?? 0}
            format={formatCurrency}
            icon={<ClockIcon />}
            subtext="Awaiting confirmation"
          />
          <StatTile
            label="Total earnings"
            value={totalEarnings}
            format={formatCurrency}
            icon={<TrendingUpIcon />}
            subtext="Lifetime"
          />
          <StatTile
            label="Total paid out"
            value={totalPaidOut}
            format={formatCurrency}
            icon={<CreditCardIcon />}
            subtext={`${paidPayouts.length} payout${paidPayouts.length === 1 ? "" : "s"}`}
          />
          </BentoGrid>
        </section>
      )}

      <section className="flex flex-col gap-4">
        <div>
          <h3 className="text-heading">Operations</h3>
        </div>
        <BentoGrid>
        <StatTile label="Locations" value={locations?.length ?? 0} icon={<MapPinIcon />} />
        <StatTile
          label="Devices"
          value={deviceStats.total}
          icon={<MonitorIcon />}
          subtext={`${deviceStats.active} active, ${deviceStats.disabled} disabled`}
        />
        {isKioskOwner && (
          <StatTile
            label="Commission events"
            value={events?.length ?? 0}
            icon={<ReceiptIcon />}
            subtext={eventsGrowthLabel ? `${eventsGrowthLabel} this month` : undefined}
          />
        )}
        <Meter
          label="Devices active"
          value={deviceStats.active}
          max={deviceStats.total}
          caption={`${deviceStats.active} of ${deviceStats.total} active`}
        />
        </BentoGrid>
      </section>

      {isKioskOwner && (
        <section>
          <BentoCard>
            <div className="mb-2 flex flex-col gap-0.5">
              <h3 className="text-heading">Earnings overview</h3>
            </div>
            {eventsLoading ? (
              <Skeleton className="h-[260px] w-full" />
            ) : (
              <TrendChart data={chartSeries} valueLabel="Earnings" />
            )}
          </BentoCard>
        </section>
      )}

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <BentoCard>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-heading">Devices by location</h3>
            <Link href="/portal/devices" className="text-sm text-muted-foreground hover:underline">
              View all →
            </Link>
          </div>
          <div className="flex flex-col gap-2">
            {devicesLoading &&
              Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
            {!devicesLoading && devicesByLocation.length === 0 && (
              <p className="text-sm text-muted-foreground">No devices yet.</p>
            )}
            {devicesByLocation.map((entry) => (
              <div key={entry.locationId} className="flex items-center justify-between py-1">
                <span className="text-sm">{entry.name}</span>
                <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  {entry.total} device{entry.total === 1 ? "" : "s"}
                  {entry.total > 0 && entry.active === entry.total ? (
                    <CircleCheckIcon className="size-3.5 text-[var(--brand-teal)]" />
                  ) : (
                    <CirclePauseIcon className="size-3.5 text-muted-foreground" />
                  )}
                </span>
              </div>
            ))}
          </div>
        </BentoCard>

        <BentoCard>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-heading">Your locations</h3>
            <Link href="/portal/locations" className="text-sm text-muted-foreground hover:underline">
              View all →
            </Link>
          </div>
          <div className="flex flex-col gap-2">
            {locationsLoading &&
              Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
            {!locationsLoading && (locations?.length ?? 0) === 0 && (
              <p className="text-sm text-muted-foreground">No locations yet.</p>
            )}
            {locations?.slice(0, 5).map((location) => (
              <Link
                key={location.id}
                href={`/portal/locations/${location.id}`}
                className="-mx-2 flex items-center justify-between rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-[var(--brand-teal-tint)]/50"
              >
                <span>{location.name}</span>
                <span className="text-muted-foreground">{location.city}</span>
              </Link>
            ))}
          </div>
        </BentoCard>
      </section>

      {isKioskOwner && (
      <BentoCard>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-heading">Recent commission activity</h3>
          <Link href="/portal/earnings" className="text-sm text-muted-foreground hover:underline">
            View all →
          </Link>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Device</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {eventsLoading &&
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={3}>
                    <Skeleton className="h-6 w-full" />
                  </TableCell>
                </TableRow>
              ))}
            {!eventsLoading && recentCommissions.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-muted-foreground">
                  No commission activity yet.
                </TableCell>
              </TableRow>
            )}
            {recentCommissions.map((event) => (
              <TableRow key={event.id}>
                <TableCell className="font-medium">
                  {deviceLabelById.get(event.deviceId) ?? "Unknown device"}
                </TableCell>
                <TableCell>{formatCurrency(event.commissionAmount)}</TableCell>
                <TableCell>
                  <Badge variant={COMMISSION_STATUS_BADGE_VARIANT[event.status]}>
                    {COMMISSION_STATUS_LABEL[event.status]}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </BentoCard>
      )}

      <div className={cn("grid grid-cols-1 gap-6", isKioskOwner && "lg:grid-cols-2")}>
        {isKioskOwner && (
        <BentoCard>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-heading">Recent payouts</h3>
            <Link href="/portal/earnings" className="text-sm text-muted-foreground hover:underline">
              View all →
            </Link>
          </div>
          <div className="flex flex-col gap-2">
            {payoutsLoading &&
              Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
            {!payoutsLoading && recentPayouts.length === 0 && (
              <p className="text-sm text-muted-foreground">No payouts yet.</p>
            )}
            {recentPayouts.map((payout) => (
              <div key={payout.id} className="flex items-center justify-between py-1">
                <span className="text-sm text-muted-foreground">
                  {new Date(payout.createdAt).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  })}
                </span>
                <span className="text-sm font-medium">{formatCurrency(payout.totalAmount)}</span>
                <Badge variant={PAYOUT_STATUS_BADGE_VARIANT[payout.status]}>
                  {PAYOUT_STATUS_LABEL[payout.status]}
                </Badge>
              </div>
            ))}
          </div>
        </BentoCard>
        )}

        <BentoCard>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-heading">Announcements</h3>
            <Link href="/portal/announcements" className="text-sm text-muted-foreground hover:underline">
              View announcements →
            </Link>
          </div>
          <div className="flex flex-col gap-3">
            {announcementsLoading &&
              Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}
            {!announcementsLoading && recentAnnouncements.length === 0 && (
              <p className="text-sm text-muted-foreground">No announcements yet.</p>
            )}
            {recentAnnouncements.map((announcement) => {
              const scope =
                announcement.kioskId === null
                  ? "Platform-wide"
                  : announcement.locationIds.length === 0
                    ? "All locations"
                    : `${announcement.locationIds.length} location${announcement.locationIds.length === 1 ? "" : "s"}`
              const body = (
                <>
                  <span className="flex items-center gap-1.5 text-sm font-medium">
                    <MegaphoneIcon className="size-3.5 text-[var(--brand-teal)]" />
                    {announcement.title}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {scope} · {relativeTime(announcement.createdAt)}
                  </span>
                </>
              )
              // Broadcasts (kioskId === null) 403 on the detail route for non-admins, so they aren't links.
              return announcement.kioskId === null ? (
                <div key={announcement.id} className="-mx-2 flex flex-col gap-0.5 rounded-lg px-2 py-1.5">
                  {body}
                </div>
              ) : (
                <Link
                  key={announcement.id}
                  href={`/portal/announcements/${announcement.id}`}
                  className="-mx-2 flex flex-col gap-0.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-[var(--brand-teal-tint)]/50"
                >
                  {body}
                </Link>
              )
            })}
          </div>
        </BentoCard>
      </div>
    </div>
  )
}
