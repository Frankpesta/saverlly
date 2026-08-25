"use client"

import * as React from "react"
import { toast } from "sonner"
import { ReceiptIcon, CircleCheckIcon, ClockIcon, RefreshCwIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { BentoGrid } from "@/components/dashboard/bento-grid"
import { DatePicker } from "@/components/dashboard/date-picker"
import { StatTile } from "@/components/dashboard/stat-tile"
import { TablePagination } from "@/components/dashboard/table-pagination"
import {
  useCommissionEvents,
  useSyncCommissionsNow,
  type CommissionEventFilter,
} from "@/lib/api/hooks/use-commissions"
import { useKiosks } from "@/lib/api/hooks/use-kiosks"
import { useLocations } from "@/lib/api/hooks/use-locations"
import { useDevices } from "@/lib/api/hooks/use-devices"
import { useMerchants } from "@/lib/api/hooks/use-merchants"
import { ApiError } from "@/lib/api/client"
import { formatCurrency } from "@/lib/format-currency"
import { buildDeviceKioskMap, monthOverMonthGrowth, sumByStatus } from "@/lib/dashboard/aggregate"
import { COMMISSION_STATUS_BADGE_VARIANT, COMMISSION_STATUS_LABEL } from "@/lib/dashboard/status-labels"
import { usePagination } from "@/hooks/use-pagination"
import type { CommissionEventStatus } from "@/lib/api/types"

const ALL = "all"
const STATUSES: CommissionEventStatus[] = ["CONFIRMED", "PENDING", "REVERSED"]

export default function AdminCommissionsPage() {
  const [status, setStatus] = React.useState<string>(ALL)
  const [kioskId, setKioskId] = React.useState<string>(ALL)
  const [merchantId, setMerchantId] = React.useState<string>(ALL)
  const [dateFrom, setDateFrom] = React.useState("")
  const [dateTo, setDateTo] = React.useState("")

  const filter: CommissionEventFilter = {
    status: status === ALL ? undefined : (status as CommissionEventStatus),
    kioskId: kioskId === ALL ? undefined : kioskId,
    merchantId: merchantId === ALL ? undefined : merchantId,
    dateFrom: dateFrom ? new Date(dateFrom).toISOString() : undefined,
    dateTo: dateTo ? new Date(dateTo).toISOString() : undefined,
  }

  const { data: events, isLoading, isError } = useCommissionEvents(filter)
  // Ticks every minute so the growth stats below recompute across a calendar-month boundary
  // even if `events` itself hasn't changed (mirrors announcements/page.tsx).
  const [now, setNow] = React.useState(() => Date.now())
  React.useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(interval)
  }, [])
  const { page, setPage, pageCount, pageItems, totalItems, pageSize } = usePagination(events)
  const { data: kiosks } = useKiosks()
  const { data: merchants } = useMerchants()
  const { data: locations } = useLocations()
  const { data: devices } = useDevices()
  const syncNow = useSyncCommissionsNow()

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

  const byStatus = React.useMemo(
    () => sumByStatus(events ?? [], (e) => e.status, (e) => e.commissionAmount, STATUSES),
    [events],
  )

  const totalGrowth = React.useMemo(
    () => monthOverMonthGrowth(events ?? [], (e) => e.reportedAt, () => 1),
    // `now` isn't read directly, but it ticks every minute so this recomputes across a
    // calendar-month boundary even if `events` itself hasn't changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [events, now],
  )
  const confirmedGrowth = React.useMemo(
    () =>
      monthOverMonthGrowth(
        (events ?? []).filter((e) => e.status === "CONFIRMED"),
        (e) => e.confirmedAt ?? e.reportedAt,
        (e) => e.commissionAmount,
      ),
    // see totalGrowth above
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [events, now],
  )

  function handleSyncNow() {
    syncNow.mutate(undefined, {
      onSuccess: (result) =>
        toast.success(
          `Synced: ${result.ingested} new, ${result.confirmed} confirmed, ${result.reversed} reversed.`,
        ),
      onError: (error) =>
        toast.error(error instanceof ApiError ? error.message : "Could not sync commissions."),
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Commissions</h2>
          <p className="text-sm text-muted-foreground">
            Every commission event platform-wide, pending vs. confirmed clearly distinguished.
          </p>
        </div>
        <Button variant="outline" className="gap-1.5" onClick={handleSyncNow} disabled={syncNow.isPending}>
          <RefreshCwIcon className={`size-4 ${syncNow.isPending ? "animate-spin" : ""}`} />
          {syncNow.isPending ? "Syncing…" : "Sync Now"}
        </Button>
      </div>

      <BentoGrid>
        <StatTile
          label="Total events"
          value={events?.length ?? 0}
          icon={<ReceiptIcon />}
          delta={totalGrowth}
          subtext={totalGrowth !== null ? "vs last month" : undefined}
        />
        <StatTile
          label="Confirmed"
          value={byStatus.CONFIRMED}
          format={formatCurrency}
          icon={<CircleCheckIcon />}
          delta={confirmedGrowth}
          subtext={confirmedGrowth !== null ? "vs last month" : undefined}
        />
        <StatTile
          label="Pending"
          value={byStatus.PENDING}
          format={formatCurrency}
          icon={<ClockIcon />}
        />
      </BentoGrid>

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="filter-status">Status</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger id="filter-status" className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All statuses</SelectItem>
              {STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {COMMISSION_STATUS_LABEL[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="filter-kiosk">Kiosk</Label>
          <Select value={kioskId} onValueChange={setKioskId}>
            <SelectTrigger id="filter-kiosk" className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All kiosks</SelectItem>
              {kiosks?.map((k) => (
                <SelectItem key={k.id} value={k.id}>
                  {k.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="filter-merchant">Merchant</Label>
          <Select value={merchantId} onValueChange={setMerchantId}>
            <SelectTrigger id="filter-merchant" className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All merchants</SelectItem>
              {merchants?.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="filter-from">From</Label>
          <DatePicker id="filter-from" value={dateFrom} onChange={setDateFrom} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="filter-to">To</Label>
          <DatePicker id="filter-to" value={dateTo} onChange={setDateTo} />
        </div>
      </div>

      {isError && <p className="text-sm text-destructive">Could not load commission events.</p>}

      <div className="flex flex-col gap-2">
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
            {isLoading &&
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={5}>
                    <Skeleton className="h-6 w-full" />
                  </TableCell>
                </TableRow>
              ))}

            {!isLoading && events?.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  No commission events match these filters.
                </TableCell>
              </TableRow>
            )}

            {pageItems.map((event, index) => (
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
                <TableCell>{new Date(event.reportedAt).toLocaleDateString()}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <TablePagination
          page={page}
          pageCount={pageCount}
          totalItems={totalItems}
          pageSize={pageSize}
          onPageChange={setPage}
        />
      </div>
    </div>
  )
}
