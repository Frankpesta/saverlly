"use client"

import * as React from "react"
import Link from "next/link"
import { ArrowLeftIcon, ArrowUpRightIcon } from "lucide-react"
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
import { TablePagination } from "@/components/dashboard/table-pagination"
import { CollectionArea, CollectionSummary, WorkspaceHeader } from "@/components/dashboard/page-layout"
import { useKiosks } from "@/lib/api/hooks/use-kiosks"
import { useLocations } from "@/lib/api/hooks/use-locations"
import { useDevices } from "@/lib/api/hooks/use-devices"
import { useCommissionEvents } from "@/lib/api/hooks/use-commissions"
import { formatCurrency } from "@/lib/format-currency"
import { usePagination } from "@/hooks/use-pagination"
import { buildDeviceKioskMap, topByGroup } from "@/lib/dashboard/aggregate"
import { KIOSK_STATUS_BADGE_VARIANT, KIOSK_STATUS_LABEL } from "@/lib/dashboard/status-labels"

export default function TopPerformingKiosksPage() {
  const { data: kiosks, isLoading: kiosksLoading } = useKiosks()
  const { data: locations } = useLocations()
  const { data: devices } = useDevices()
  const { data: events, isLoading: eventsLoading } = useCommissionEvents()

  const deviceKioskMap = React.useMemo(
    () => buildDeviceKioskMap(devices ?? [], locations ?? []),
    [devices, locations],
  )

  const confirmedEvents = React.useMemo(
    () => (events ?? []).filter((e) => e.status === "CONFIRMED"),
    [events],
  )

  const kioskById = React.useMemo(() => {
    const map = new Map((kiosks ?? []).map((k) => [k.id, k]))
    return map
  }, [kiosks])

  const ranked = React.useMemo(() => {
    return topByGroup(
      confirmedEvents,
      (e) => deviceKioskMap.get(e.deviceId) ?? "unknown",
      (e) => e.kioskShareAmount,
      Infinity,
    )
      .filter((row) => row.key !== "unknown" && kioskById.has(row.key))
      .map((row) => ({ ...row, kiosk: kioskById.get(row.key)! }))
  }, [confirmedEvents, deviceKioskMap, kioskById])

  const { page, setPage, pageCount, pageItems, totalItems, pageSize } = usePagination(ranked)

  const isLoading = kiosksLoading || eventsLoading
  const totalShare = ranked.reduce((sum, row) => sum + row.total, 0)

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/admin/overview"
        className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeftIcon className="size-4" />
        Overview
      </Link>

      <WorkspaceHeader
        title="Top performing kiosks"
        description="Ranked by confirmed commission share, highest first."
      />

      <CollectionSummary
        items={[
          { label: "Ranked kiosks", value: ranked.length, detail: "With confirmed commissions" },
          { label: "Total commission share", value: formatCurrency(totalShare), detail: "Confirmed, all-time" },
        ]}
      />

      <CollectionArea title="Kiosks" titleHidden count={totalItems}>
        <div className="flex flex-col gap-2">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">#</TableHead>
                <TableHead>Kiosk</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Commission share</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading &&
                Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={5}>
                      <Skeleton className="h-6 w-full" />
                    </TableCell>
                  </TableRow>
                ))}
              {!isLoading && ranked.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    No confirmed commissions yet.
                  </TableCell>
                </TableRow>
              )}
              {pageItems.map((row, i) => (
                <TableRow key={row.key} index={i}>
                  <TableCell className="text-muted-foreground">
                    {(page - 1) * pageSize + i + 1}
                  </TableCell>
                  <TableCell className="font-medium">{row.kiosk.name}</TableCell>
                  <TableCell>
                    <Badge variant={KIOSK_STATUS_BADGE_VARIANT[row.kiosk.status]}>
                      {KIOSK_STATUS_LABEL[row.kiosk.status]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-medium">{formatCurrency(row.total)}</TableCell>
                  <TableCell>
                    <TableRowActions>
                      <Link
                        href={`/admin/kiosks/${row.key}`}
                        className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
                        aria-label={`View ${row.kiosk.name}`}
                      >
                        <ArrowUpRightIcon className="size-3.5" />
                      </Link>
                    </TableRowActions>
                  </TableCell>
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
      </CollectionArea>
    </div>
  )
}
