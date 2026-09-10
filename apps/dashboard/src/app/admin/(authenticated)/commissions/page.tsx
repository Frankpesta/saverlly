"use client"

import { InlineQueryError } from "@/components/dashboard/query-state"

import * as React from "react"
import { toast } from "sonner"
import { HandCoinsIcon, CircleCheckIcon, ClockIcon, RefreshCwIcon, SearchIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Combobox,
} from "@/components/ui/combobox"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableEmptyRow,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { BentoGrid } from "@/components/dashboard/bento-grid"
import { DateRangePicker } from "@/components/dashboard/date-picker"
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
  const [dateFrom, setDateFrom] = React.useState("")
  const [dateTo, setDateTo] = React.useState("")
  const [search, setSearch] = React.useState("")
  // Client-side refinement on top of the server-side filter below (merchant/kiosk name isn't
  // something the events endpoint can search on), so it's debounced the same way
  // useCollectionView debounces every other list page's search box.
  const [debouncedSearch, setDebouncedSearch] = React.useState("")
  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 250)
    return () => clearTimeout(timer)
  }, [search])

  // Recreating this object every render (it used to be an inline literal, not memoized) gave
  // useCommissionEvents a new identity each time and refired the query far more than the actual
  // filter values changed.
  const filter: CommissionEventFilter = React.useMemo(
    () => ({
      status: status === ALL ? undefined : (status as CommissionEventStatus),
      dateFrom: dateFrom ? new Date(dateFrom).toISOString() : undefined,
      dateTo: dateTo ? new Date(dateTo).toISOString() : undefined,
    }),
    [status, dateFrom, dateTo],
  )

  const { data: events, isLoading, isError, refetch } = useCommissionEvents(filter)
  // Ticks every minute so the growth stats below recompute across a calendar-month boundary
  // even if `events` itself hasn't changed (mirrors announcements/page.tsx).
  const [now, setNow] = React.useState(() => Date.now())
  React.useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(interval)
  }, [])
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

  // Stat tiles above stay scoped to the server-side filters only (status/kiosk/merchant/date),
  // matching how every other list page's summary tiles ignore the free-text search box — search
  // narrows what's visible in the table, not "how many exist" under the current filters.
  const searchedEvents = React.useMemo(() => {
    const needle = debouncedSearch.trim().toLowerCase()
    if (!needle) return events ?? []
    return (events ?? []).filter((event) => {
      const merchantName = merchantNameById.get(event.merchantId) ?? ""
      const kioskName = kioskNameById.get(deviceKioskMap.get(event.deviceId) ?? "") ?? ""
      return merchantName.toLowerCase().includes(needle) || kioskName.toLowerCase().includes(needle)
    })
  }, [events, debouncedSearch, merchantNameById, kioskNameById, deviceKioskMap])

  const hasFilters = status !== ALL || !!dateFrom || !!dateTo || !!search

  const { page, setPage, pageCount, pageItems, totalItems, pageSize } = usePagination(
    searchedEvents,
    undefined,
    `${debouncedSearch}:${JSON.stringify(filter)}`,
  )

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
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-title">Commissions</h1>
          <p className="text-sm text-muted-foreground">
            Every commission event platform-wide, pending vs. confirmed clearly distinguished.
          </p>
        </div>
        <Button variant="outline" className="gap-1.5" onClick={handleSyncNow} disabled={syncNow.isPending}>
          <RefreshCwIcon className={`size-4 ${syncNow.isPending ? "animate-spin" : ""}`} />
          {syncNow.isPending ? "Syncing…" : "Sync Now"}
        </Button>
      </div>

      <p className="text-meta text-muted-foreground">Summary of the filtered results. Monthly comparisons use this same scope.</p>
      <BentoGrid>
        <StatTile isLoading={isLoading} isError={isError}
          label="Total events"
          value={events?.length ?? 0}
          icon={<HandCoinsIcon />}
          delta={totalGrowth}
          subtext={totalGrowth !== null ? "vs last month" : undefined}
        />
        <StatTile isLoading={isLoading} isError={isError}
          label="Confirmed"
          value={byStatus.CONFIRMED}
          format={formatCurrency}
          icon={<CircleCheckIcon />}
          delta={confirmedGrowth}
          subtext={confirmedGrowth !== null ? "vs last month" : undefined}
        />
        <StatTile isLoading={isLoading} isError={isError}
          label="Pending"
          value={byStatus.PENDING}
          format={formatCurrency}
          icon={<ClockIcon />}
        />
      </BentoGrid>

      {isError && <InlineQueryError message="Could not load commission events." onRetry={refetch} />}

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="filter-search">Search</Label>
          <div className="relative w-56">
            <SearchIcon
              aria-hidden
              className="pointer-events-none absolute top-3 left-3 size-4 text-muted-foreground"
            />
            <Input
              id="filter-search"
              type="search"
              placeholder="Search by merchant or kiosk…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="pl-9"
            />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="filter-status">Status</Label>
          <Combobox
            id="filter-status"
            value={status}
            onValueChange={setStatus}
            className="w-40"
            options={[
              { value: ALL, label: "All statuses" },
              ...STATUSES.map((s) => ({ value: s, label: COMMISSION_STATUS_LABEL[s] })),
            ]}
          />
        </div>
        {/* One range control rather than two independent single pickers, so the two dates read
            as one filter and can be drag-selected or picked from a preset in the calendar. */}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="filter-range">Date range</Label>
          <DateRangePicker
            id="filter-range"
            value={{ from: dateFrom, to: dateTo }}
            onChange={(next) => {
              setDateFrom(next.from)
              setDateTo(next.to)
            }}
          />
        </div>
        <Button type="button" variant="ghost" onClick={() => { setStatus(ALL); setDateFrom(""); setDateTo(""); setSearch("") }}>Clear filters</Button>

      </div>

      <div className="flex flex-col gap-2">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Merchant</TableHead>
              <TableHead>Kiosk</TableHead>
              <TableHead className="text-right">Total commission</TableHead>
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

            {!isLoading && searchedEvents.length === 0 && (
              <TableEmptyRow colSpan={5} hasFilters={hasFilters}>
                No commission events yet.
              </TableEmptyRow>
            )}

            {pageItems.map((event, index) => (
              <TableRow key={event.id} index={index}>
                <TableCell className="font-medium">
                  {merchantNameById.get(event.merchantId) ?? "Unknown merchant"}
                </TableCell>
                <TableCell>
                  {kioskNameById.get(deviceKioskMap.get(event.deviceId) ?? "") ?? "Unknown kiosk"}
                </TableCell>
                <TableCell className="text-right tabular-nums">{formatCurrency(event.commissionAmount)}</TableCell>
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
