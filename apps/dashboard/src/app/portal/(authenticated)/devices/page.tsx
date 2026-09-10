"use client"

import { InlineQueryError } from "@/components/dashboard/query-state"

import * as React from "react"
import Link from "next/link"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableEmptyRow,
  TableHead,
  TableHeader,
  TableRow,
  TableRowActions,
} from "@/components/ui/table"
import { DeleteRowButton } from "@/components/dashboard/delete-row-button"
import { TablePagination } from "@/components/dashboard/table-pagination"
import { CollectionArea, CollectionSummary, WorkspaceHeader } from "@/components/dashboard/page-layout"
import { useDeleteDevice, useDevices, useUpdateDevice } from "@/lib/api/hooks/use-devices"
import { useLocations } from "@/lib/api/hooks/use-locations"
import { useCurrentUser } from "@/lib/api/hooks/use-current-user"
import { ApiError } from "@/lib/api/client"
import { relativeTime } from "@/lib/relative-time"
import { useCollectionView } from "@/hooks/use-collection-view"
import { CollectionToolbar } from "@/components/dashboard/collection-toolbar"
import { usePagination } from "@/hooks/use-pagination"
import { DownloadAgentButton } from "./download-agent-button"

const ONLINE_THRESHOLD_MS = 60 * 60 * 1000 // 1 hour, matching the extension's own grace window

export default function DevicesPage() {
  const { data: devices, isLoading, isError, refetch } = useDevices()
  const { data: locations } = useLocations()
  const { data: currentUser } = useCurrentUser()
  const isKioskOwner = currentUser?.role === "KIOSK_OWNER"
  const updateDevice = useUpdateDevice()
  const deleteDevice = useDeleteDevice()
  const view = useCollectionView(devices, {
    searchText: (item) => [item.label, locations?.find((location) => location.id === item.locationId)?.name].join(" "),
    sorts: [{ label: "Name: A to Z", value: "name", compare: (a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }) }, { label: "Last seen: newest", value: "seen", compare: (a, b) => new Date(b.lastSeenAt ?? 0).getTime() - new Date(a.lastSeenAt ?? 0).getTime() }],
    filters: [{ key: "status", label: "Status", options: [{ label: "Enabled", value: "active", matches: (item) => item.active }, { label: "Disabled", value: "inactive", matches: (item) => !(item.active) }] }],
  })
  const { page, setPage, pageCount, pageItems, totalItems, pageSize } = usePagination(view.items, undefined, view.resetKey)

  const locationNameById = React.useMemo(() => {
    const map = new Map<string, string>()
    for (const location of locations ?? []) map.set(location.id, location.name)
    return map
  }, [locations])

  const [now, setNow] = React.useState(() => Date.now())
  React.useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(interval)
  }, [])

  const stats = React.useMemo(() => {
    const list = devices ?? []
    const active = list.filter((d) => d.active).length
    const online = list.filter(
      (d) => d.lastSeenAt && now - new Date(d.lastSeenAt).getTime() < ONLINE_THRESHOLD_MS,
    ).length
    return { total: list.length, active, online }
  }, [devices, now])

  function toggleActive(id: string, active: boolean) {
    updateDevice.mutate(
      { id, active: !active },
      {
        onError: (error) =>
          toast.error(error instanceof ApiError ? error.message : "Could not update device."),
      },
    )
  }

  function handleDelete(id: string) {
    deleteDevice.mutate(id, {
      onSuccess: () => toast.success("Device deleted."),
      onError: (error) =>
        toast.error(error instanceof ApiError ? error.message : "Could not delete device."),
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <WorkspaceHeader title="Devices" actions={<DownloadAgentButton />} />

      <CollectionSummary isLoading={isLoading} isError={isError} items={[
        { label: "Devices", value: stats.total, detail: "Registered endpoints" },
        { label: "Active", value: stats.active, detail: "Available to report" },
        { label: "Seen in the last hour", value: stats.online, detail: "Currently responsive" },
      ]} />

      <CollectionToolbar view={view} label="Devices" />

      {isError && <InlineQueryError message="Could not load devices." onRetry={refetch} />}

      <CollectionArea title="Device directory" titleHidden count={totalItems}>
      <div className="flex flex-col gap-2">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Device</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Last seen</TableHead>
              <TableHead>Status</TableHead>
              {isKioskOwner && <TableHead className="w-16" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={isKioskOwner ? 5 : 4}>
                    <Skeleton className="h-6 w-full" />
                  </TableCell>
                </TableRow>
              ))}

            {!isLoading && !isError && view.items.length === 0 && (
              // A device joins by running the agent installer and entering its location's setup
              // code, so an empty table is exactly when someone needs both — but only when it's
              // genuinely empty, not when a search/filter just turned up nothing.
              <TableEmptyRow colSpan={isKioskOwner ? 5 : 4} hasFilters={view.hasFilters}>
                No devices yet. Download the agent above, then enter a location&apos;s{" "}
                <Link href="/portal/locations" className="text-foreground underline underline-offset-2">
                  setup code
                </Link>{" "}
                during install.
              </TableEmptyRow>
            )}

            {pageItems.map((device, index) => (
              <TableRow key={device.id} index={index}>
                <TableCell className="font-medium">{device.label}</TableCell>
                <TableCell>{locationNameById.get(device.locationId) ?? "Unassigned"}</TableCell>
                <TableCell>
                  {device.lastSeenAt ? relativeTime(device.lastSeenAt) : "Never"}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={device.active}
                      onCheckedChange={() => toggleActive(device.id, device.active)}
                      disabled={updateDevice.isPending}
                      aria-label={`Toggle ${device.label} status`}
                    />
                    <Badge variant={device.active ? "success" : "destructive"}>
                      {device.active ? "Active" : "Disabled"}
                    </Badge>
                  </div>
                </TableCell>
                {isKioskOwner && (
                  <TableCell>
                    <TableRowActions>
                      <DeleteRowButton
                        itemLabel={device.label}
                        onConfirm={() => handleDelete(device.id)}
                        isPending={deleteDevice.isPending}
                      />
                    </TableRowActions>
                  </TableCell>
                )}
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
