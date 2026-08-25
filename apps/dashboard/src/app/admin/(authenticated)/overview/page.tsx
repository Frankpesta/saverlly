"use client"

import * as React from "react"
import Link from "next/link"
import { motion } from "motion/react"
import {
  StoreIcon,
  MapPinIcon,
  MonitorIcon,
  BanknoteIcon,
  ClockIcon,
  CircleCheckIcon,
  TriangleAlertIcon,
  ArrowUpRightIcon,
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
  TableRowActions,
} from "@/components/ui/table"
import { BentoCard, BentoGrid } from "@/components/dashboard/bento-grid"
import { StatTile } from "@/components/dashboard/stat-tile"
import { Gauge } from "@/components/dashboard/gauge"
import { TrendChart } from "@/components/dashboard/trend-chart"
import { useKiosks } from "@/lib/api/hooks/use-kiosks"
import { useLocations } from "@/lib/api/hooks/use-locations"
import { useDevices } from "@/lib/api/hooks/use-devices"
import { useCommissionEvents } from "@/lib/api/hooks/use-commissions"
import { usePayouts } from "@/lib/api/hooks/use-payouts"
import { useMerchants } from "@/lib/api/hooks/use-merchants"
import { useCoupons } from "@/lib/api/hooks/use-coupons"
import { formatCurrency } from "@/lib/format-currency"
import { relativeTime } from "@/lib/relative-time"
import { cn } from "@/lib/utils"
import {
  bucketByDay,
  buildDeviceKioskMap,
  deviceCounts,
  monthOverMonthGrowth,
  sumByStatus,
  topByGroup,
} from "@/lib/dashboard/aggregate"
import { COMMISSION_STATUS_BADGE_VARIANT, COMMISSION_STATUS_LABEL } from "@/lib/dashboard/status-labels"

const COMMISSION_STATUSES = ["CONFIRMED", "PENDING", "REVERSED"] as const

// Same hues as the badge variants for these statuses (status-labels.ts) — a status reads as
// the same color everywhere in the app, not just in a Badge.
const SEGMENT_BG: Record<(typeof COMMISSION_STATUSES)[number], string> = {
  CONFIRMED: "bg-[var(--success)]",
  PENDING: "bg-[var(--warning)]",
  REVERSED: "bg-destructive",
}
const SEGMENT_DOT: Record<(typeof COMMISSION_STATUSES)[number], string> = {
  CONFIRMED: "bg-[var(--success)]",
  PENDING: "bg-[var(--warning)]",
  REVERSED: "bg-destructive",
}

// A merchant needs a meaningful sample before its success rate means anything —
// flagging a merchant with 1 test event and a 0% rate would just be noise.
const MIN_ATTEMPTS_FOR_RATE = 5
const LOW_SUCCESS_RATE_THRESHOLD = 0.5

export default function AdminOverviewPage() {
  const { data: kiosks, isLoading: kiosksLoading } = useKiosks()
  const { data: locations } = useLocations()
  const { data: devices } = useDevices()
  const { data: events, isLoading: eventsLoading } = useCommissionEvents()
  const { data: payouts } = usePayouts()
  const { data: merchants } = useMerchants()
  const { data: coupons } = useCoupons()

  const kioskStats = React.useMemo(() => {
    const list = kiosks ?? []
    const active = list.filter((k) => k.status === "ACTIVE").length
    return { total: list.length, active, inactive: list.length - active }
  }, [kiosks])

  const deviceStats = React.useMemo(() => deviceCounts(devices ?? []), [devices])

  const confirmedEvents = React.useMemo(
    () => (events ?? []).filter((e) => e.status === "CONFIRMED"),
    [events],
  )

  const commissionByStatus = React.useMemo(
    () => sumByStatus(events ?? [], (e) => e.status, (e) => e.commissionAmount, COMMISSION_STATUSES),
    [events],
  )
  const totalCommission =
    commissionByStatus.CONFIRMED + commissionByStatus.PENDING + commissionByStatus.REVERSED

  const totalGrowth = React.useMemo(
    () => monthOverMonthGrowth(events ?? [], (e) => e.reportedAt, (e) => e.commissionAmount),
    [events],
  )
  const confirmedGrowth = React.useMemo(
    () =>
      monthOverMonthGrowth(confirmedEvents, (e) => e.confirmedAt ?? e.reportedAt, (e) => e.commissionAmount),
    [confirmedEvents],
  )

  const chartSeries = React.useMemo(
    () =>
      bucketByDay(
        confirmedEvents,
        (e) => e.confirmedAt ?? e.reportedAt,
        (e) => e.commissionAmount,
        365,
      ),
    [confirmedEvents],
  )

  const deviceKioskMap = React.useMemo(
    () => buildDeviceKioskMap(devices ?? [], locations ?? []),
    [devices, locations],
  )

  const kioskNameById = React.useMemo(() => {
    const map = new Map<string, string>()
    for (const k of kiosks ?? []) map.set(k.id, k.name)
    return map
  }, [kiosks])

  const merchantNameById = React.useMemo(() => {
    const map = new Map<string, string>()
    for (const m of merchants ?? []) map.set(m.id, m.name)
    return map
  }, [merchants])

  const topKiosks = React.useMemo(() => {
    return topByGroup(confirmedEvents, (e) => deviceKioskMap.get(e.deviceId) ?? "unknown", (e) => e.kioskShareAmount, 5)
      .filter((row) => row.key !== "unknown")
      .map((row) => ({ ...row, name: kioskNameById.get(row.key) ?? "Unknown kiosk" }))
  }, [confirmedEvents, deviceKioskMap, kioskNameById])

  const couponStatsByMerchant = React.useMemo(() => {
    const map = new Map<string, { success: number; fail: number }>()
    for (const coupon of coupons ?? []) {
      const entry = map.get(coupon.merchantId) ?? { success: 0, fail: 0 }
      entry.success += coupon.successCount
      entry.fail += coupon.failCount
      map.set(coupon.merchantId, entry)
    }
    return map
  }, [coupons])

  const topMerchants = React.useMemo(() => {
    return topByGroup(confirmedEvents, (e) => e.merchantId, (e) => e.commissionAmount, 5).map((row) => {
      const couponStats = couponStatsByMerchant.get(row.key)
      const attempts = (couponStats?.success ?? 0) + (couponStats?.fail ?? 0)
      const successRate = attempts > 0 ? (couponStats!.success / attempts) * 100 : null
      return { ...row, name: merchantNameById.get(row.key) ?? "Unknown merchant", successRate }
    })
  }, [confirmedEvents, merchantNameById, couponStatsByMerchant])

  const couponTotals = React.useMemo(() => {
    const list = coupons ?? []
    const success = list.reduce((sum, c) => sum + c.successCount, 0)
    const fail = list.reduce((sum, c) => sum + c.failCount, 0)
    return { success, fail, attempts: success + fail }
  }, [coupons])

  const lowSuccessMerchants = React.useMemo(() => {
    let count = 0
    for (const [, stats] of couponStatsByMerchant) {
      const attempts = stats.success + stats.fail
      if (attempts >= MIN_ATTEMPTS_FOR_RATE && stats.success / attempts < LOW_SUCCESS_RATE_THRESHOLD) {
        count += 1
      }
    }
    return count
  }, [couponStatsByMerchant])

  const payoutTotals = React.useMemo(() => {
    const list = payouts ?? []
    const now = new Date()
    const pending = list.filter((p) => p.status === "pending")
    const paidThisMonth = list.filter(
      (p) =>
        p.status === "paid" &&
        p.paidAt &&
        new Date(p.paidAt).getMonth() === now.getMonth() &&
        new Date(p.paidAt).getFullYear() === now.getFullYear(),
    )
    const availableForPayout = (events ?? [])
      .filter((e) => e.status === "CONFIRMED" && e.payoutId === null)
      .reduce((sum, e) => sum + e.kioskShareAmount, 0)
    return {
      available: availableForPayout,
      pending: pending.reduce((sum, p) => sum + p.totalAmount, 0),
      pendingCount: pending.length,
      paidThisMonth: paidThisMonth.reduce((sum, p) => sum + p.totalAmount, 0),
    }
  }, [payouts, events])

  const recentEvents = React.useMemo(
    () =>
      [...(events ?? [])]
        .sort((a, b) => new Date(b.reportedAt).getTime() - new Date(a.reportedAt).getTime())
        .slice(0, 6),
    [events],
  )

  const recentActivity = React.useMemo(() => {
    return [...(kiosks ?? [])]
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 5)
  }, [kiosks])

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-4">
        <BentoGrid>
          <StatTile
            label="Total kiosks"
            value={kioskStats.total}
            icon={<StoreIcon />}
            subtext={`${kioskStats.active} active, ${kioskStats.inactive} inactive`}
          />
          <StatTile label="Total locations" value={locations?.length ?? 0} icon={<MapPinIcon />} />
          <StatTile
            label="Devices"
            value={deviceStats.total}
            icon={<MonitorIcon />}
            subtext={`${deviceStats.active} active, ${deviceStats.disabled} disabled`}
          />
          <StatTile
            label="Total commissions"
            value={totalCommission}
            format={formatCurrency}
            icon={<BanknoteIcon />}
            delta={totalGrowth}
            trend={chartSeries.slice(-14).map((point) => point.value)}
            subtext={totalGrowth !== null ? "vs last month" : undefined}
          />
          <StatTile
            label="Pending commissions"
            value={commissionByStatus.PENDING}
            format={formatCurrency}
            icon={<ClockIcon />}
            subtext="Awaiting confirmation"
          />
          <StatTile
            label="Confirmed commissions"
            value={commissionByStatus.CONFIRMED}
            format={formatCurrency}
            icon={<CircleCheckIcon />}
            delta={confirmedGrowth}
            trend={chartSeries.slice(-14).map((point) => point.value)}
            subtext={confirmedGrowth !== null ? "vs last month" : undefined}
          />
        </BentoGrid>
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <BentoCard>
            <div className="mb-2 flex flex-col gap-0.5">
              <h3 className="text-sm font-semibold">Commission performance</h3>
              <p className="text-sm text-muted-foreground">Confirmed commission trend, platform-wide.</p>
            </div>
            {eventsLoading ? (
              <Skeleton className="h-[260px] w-full" />
            ) : (
              <TrendChart data={chartSeries} valueLabel="Commission" />
            )}
          </BentoCard>

          <BentoCard>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Commission breakdown</h3>
              <Link href="/admin/commissions" className="text-sm text-muted-foreground hover:underline">
                View all →
              </Link>
            </div>
            <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
              {COMMISSION_STATUSES.map((status) => {
                const pct = totalCommission > 0 ? (commissionByStatus[status] / totalCommission) * 100 : 0
                if (pct <= 0) return null
                return (
                  <motion.div
                    key={status}
                    className={cn("h-full", SEGMENT_BG[status])}
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.8, ease: "easeOut" }}
                  />
                )
              })}
            </div>
            <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
              {COMMISSION_STATUSES.map((status) => (
                <div key={status} className="flex items-center gap-2 text-sm">
                  <span className={cn("size-2.5 shrink-0 rounded-full", SEGMENT_DOT[status])} />
                  <span className="text-muted-foreground">{COMMISSION_STATUS_LABEL[status]}</span>
                  <span className="font-medium">{formatCurrency(commissionByStatus[status])}</span>
                </div>
              ))}
            </div>
          </BentoCard>
        </div>

        <div className="flex flex-col gap-4 lg:col-span-1">
          <Gauge
            label="Kiosks active"
            value={kioskStats.active}
            max={kioskStats.total}
            caption={`${kioskStats.active} of ${kioskStats.total} kiosks active`}
          />
          <Gauge
            label="Devices active"
            value={deviceStats.active}
            max={deviceStats.total}
            caption={`${deviceStats.active} of ${deviceStats.total} devices active`}
          />
          <BentoCard>
            <div className="flex h-full flex-col gap-3">
              <h3 className="text-sm font-semibold">Coupon performance</h3>
              <div className="flex flex-1 flex-col justify-center gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Total attempts</span>
                  <span className="text-sm font-medium">{couponTotals.attempts.toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Successful</span>
                  <span className="text-sm font-medium">{couponTotals.success.toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Failed</span>
                  <span className="text-sm font-medium">{couponTotals.fail.toLocaleString()}</span>
                </div>
                <div className="mt-1 flex items-center justify-between border-t border-black/6 pt-2">
                  <span className="text-sm text-muted-foreground">Success rate</span>
                  <span className="text-sm font-semibold">
                    {couponTotals.attempts > 0
                      ? `${((couponTotals.success / couponTotals.attempts) * 100).toFixed(1)}%`
                      : "—"}
                  </span>
                </div>
              </div>
              <Link href="/admin/coupons" className="text-sm text-muted-foreground hover:underline">
                View coupon analytics →
              </Link>
            </div>
          </BentoCard>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <BentoCard>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Top performing kiosks</h3>
            <Link href="/admin/kiosks" className="text-sm text-muted-foreground hover:underline">
              View all →
            </Link>
          </div>
          <Table>
            <TableBody>
              {(kiosksLoading || eventsLoading) &&
                Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={3}>
                      <Skeleton className="h-8 w-full" />
                    </TableCell>
                  </TableRow>
                ))}
              {!kiosksLoading && !eventsLoading && topKiosks.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground">
                    No confirmed commissions yet.
                  </TableCell>
                </TableRow>
              )}
              {topKiosks.map((row, i) => (
                <TableRow key={row.key} index={i} className="border-0">
                  <TableCell className="w-10 pr-0">
                    <span className="flex size-6 items-center justify-center rounded-full bg-[var(--brand-teal-tint)] text-xs font-semibold text-[var(--brand-teal)]">
                      {i + 1}
                    </span>
                  </TableCell>
                  <TableCell className="font-medium">{row.name}</TableCell>
                  <TableCell className="text-right font-medium">{formatCurrency(row.total)}</TableCell>
                  <TableCell className="w-16">
                    <TableRowActions>
                      <Link
                        href={`/admin/kiosks/${row.key}`}
                        className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }), "text-muted-foreground hover:text-foreground")}
                        aria-label={`View ${row.name}`}
                      >
                        <ArrowUpRightIcon className="size-3.5" />
                      </Link>
                    </TableRowActions>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </BentoCard>

        <BentoCard>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Top merchants</h3>
            <Link href="/admin/merchants" className="text-sm text-muted-foreground hover:underline">
              View all →
            </Link>
          </div>
          <Table>
            <TableBody>
              {eventsLoading &&
                Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={4}>
                      <Skeleton className="h-8 w-full" />
                    </TableCell>
                  </TableRow>
                ))}
              {!eventsLoading && topMerchants.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    No confirmed commissions yet.
                  </TableCell>
                </TableRow>
              )}
              {topMerchants.map((row, i) => (
                <TableRow key={row.key} index={i} className="border-0">
                  <TableCell className="font-medium">{row.name}</TableCell>
                  <TableCell>
                    {row.successRate !== null ? (
                      <Badge variant={row.successRate >= 50 ? "success" : "warning"}>
                        {row.successRate.toFixed(0)}% coupons
                      </Badge>
                    ) : (
                      <span className="text-sm text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-medium">{formatCurrency(row.total)}</TableCell>
                  <TableCell className="w-16">
                    <TableRowActions>
                      <Link
                        href={`/admin/merchants/${row.key}`}
                        className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }), "text-muted-foreground hover:text-foreground")}
                        aria-label={`View ${row.name}`}
                      >
                        <ArrowUpRightIcon className="size-3.5" />
                      </Link>
                    </TableRowActions>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </BentoCard>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <BentoCard>
          <div className="flex h-full flex-col gap-3">
            <h3 className="text-sm font-semibold">Payout overview</h3>
            <div className="flex flex-1 flex-col justify-center gap-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Available for payout</span>
                <span className="text-sm font-medium">{formatCurrency(payoutTotals.available)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Pending payouts</span>
                <span className="text-sm font-medium">{formatCurrency(payoutTotals.pending)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Paid this month</span>
                <span className="text-sm font-medium">{formatCurrency(payoutTotals.paidThisMonth)}</span>
              </div>
            </div>
            <Link href="/admin/payouts" className="text-sm text-muted-foreground hover:underline">
              Manage payouts →
            </Link>
          </div>
        </BentoCard>

        <BentoCard>
          <div className="mb-3 flex items-center gap-2">
            <TriangleAlertIcon className="size-4 text-[var(--warning)]" />
            <h3 className="text-sm font-semibold">Needs attention</h3>
          </div>
          <div className="flex flex-col gap-3">
            {kioskStats.inactive > 0 && (
              <Link href="/admin/kiosks" className="flex flex-col gap-0.5 hover:underline">
                <span className="text-sm">
                  {kioskStats.inactive} kiosk{kioskStats.inactive === 1 ? "" : "s"} {kioskStats.inactive === 1 ? "is" : "are"} inactive
                </span>
                <span className="text-xs text-muted-foreground">Review kiosk status</span>
              </Link>
            )}
            {deviceStats.disabled > 0 && (
              <Link href="/admin/devices" className="flex flex-col gap-0.5 hover:underline">
                <span className="text-sm">{deviceStats.disabled} devices are disabled</span>
                <span className="text-xs text-muted-foreground">View devices</span>
              </Link>
            )}
            {lowSuccessMerchants > 0 && (
              <Link href="/admin/merchants" className="flex flex-col gap-0.5 hover:underline">
                <span className="text-sm">
                  {lowSuccessMerchants} merchant{lowSuccessMerchants === 1 ? " has" : "s have"} low coupon
                  success rates
                </span>
                <span className="text-xs text-muted-foreground">Review merchants</span>
              </Link>
            )}
            {payoutTotals.pendingCount > 0 && (
              <Link href="/admin/payouts" className="flex flex-col gap-0.5 hover:underline">
                <span className="text-sm">{formatCurrency(payoutTotals.pending)} in payouts awaiting processing</span>
                <span className="text-xs text-muted-foreground">Review payouts</span>
              </Link>
            )}
            {kioskStats.inactive === 0 &&
              deviceStats.disabled === 0 &&
              lowSuccessMerchants === 0 &&
              payoutTotals.pendingCount === 0 && (
                <p className="text-sm text-muted-foreground">Nothing needs attention right now.</p>
              )}
          </div>
        </BentoCard>
      </div>

      <BentoCard>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Recent commission events</h3>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Merchant</TableHead>
              <TableHead>Kiosk</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Reported</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {eventsLoading &&
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={5}>
                    <Skeleton className="h-6 w-full" />
                  </TableCell>
                </TableRow>
              ))}
            {!eventsLoading && recentEvents.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  No commission events yet.
                </TableCell>
              </TableRow>
            )}
            {recentEvents.map((event, index) => (
              <TableRow key={event.id} index={index}>
                <TableCell className="font-medium">
                  {merchantNameById.get(event.merchantId) ?? "Unknown merchant"}
                </TableCell>
                <TableCell>
                  {kioskNameById.get(deviceKioskMap.get(event.deviceId) ?? "") ?? "Unknown kiosk"}
                </TableCell>
                <TableCell>{formatCurrency(event.commissionAmount)}</TableCell>
                <TableCell>
                  <Badge variant={COMMISSION_STATUS_BADGE_VARIANT[event.status]}>
                    {COMMISSION_STATUS_LABEL[event.status]}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">{relativeTime(event.reportedAt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </BentoCard>

      <BentoCard>
        <h3 className="mb-3 text-sm font-semibold">Recent platform activity</h3>
        <div className="flex flex-col gap-3">
          {kiosksLoading &&
            Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}
          {!kiosksLoading && recentActivity.length === 0 && (
            <p className="text-sm text-muted-foreground">No activity yet.</p>
          )}
          {recentActivity.map((kiosk) => {
            const justCreated = new Date(kiosk.createdAt).getTime() === new Date(kiosk.updatedAt).getTime()
            return (
              <Link
                key={kiosk.id}
                href={`/admin/kiosks/${kiosk.id}`}
                className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-[var(--brand-teal-tint)]/50"
              >
                <span
                  className={cn(
                    "size-2 shrink-0 rounded-full",
                    justCreated ? "bg-[var(--info)]" : "bg-[var(--success)]",
                  )}
                />
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium">
                    {kiosk.name}{" "}
                    <span className="font-normal text-muted-foreground">
                      was {justCreated ? "created" : "updated"}
                    </span>
                  </span>
                  <span className="text-xs text-muted-foreground">{relativeTime(kiosk.updatedAt)}</span>
                </div>
              </Link>
            )
          })}
        </div>
      </BentoCard>
    </div>
  )
}
