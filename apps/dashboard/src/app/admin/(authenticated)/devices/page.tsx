"use client"

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
import { useKiosks } from "@/lib/api/hooks/use-kiosks"
import { ApiError } from "@/lib/api/client"
import { relativeTime } from "@/lib/relative-time"
import { usePagination } from "@/hooks/use-pagination"

const ONLINE_THRESHOLD_MS = 60 * 60 * 1000 // 1 hour, matching the extension's own grace window

export default function AdminDevicesPage() {
  const { data: devices, isLoading, isError } = useDevices()
  const { data: locations } = useLocations()
  const { data: kiosks } = useKiosks()
  const updateDevice = useUpdateDevice()
  const deleteDevice = useDeleteDevice()
  const { page, setPage, pageCount, pageItems, totalItems, pageSize } = usePagination(devices)

  const kioskNameById = React.useMemo(() => {
    const map = new Map<string, string>()
    for (const kiosk of kiosks ?? []) map.set(kiosk.id, kiosk.name)
    return map
  }, [kiosks])

  const locationById = React.useMemo(() => {
    const map = new Map<string, { name: string; kioskId: string }>()
    for (const location of locations ?? [])
      map.set(location.id, { name: location.name, kioskId: location.kioskId })
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
      <WorkspaceHeader
        title="Devices"
      />

      <CollectionSummary items={[
        { label: "Devices", value: stats.total, detail: "Registered endpoints" },
        { label: "Active", value: stats.active, detail: "Available to report" },
        { label: "Seen in the last hour", value: stats.online, detail: "Currently responsive" },
      ]} />

      {isError && <p className="text-sm text-destructive">Could not load devices.</p>}

      <CollectionArea title="Device directory" titleHidden count={totalItems}>
      <div className="flex flex-col gap-2">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Device</TableHead>
              <TableHead>Kiosk</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Last seen</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-16" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={6}>
                    <Skeleton className="h-6 w-full" />
                  </TableCell>
                </TableRow>
              ))}

            {!isLoading && devices?.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  {/* Devices register themselves using a location's setup code, so an empty
                      table is exactly the moment someone needs to find one. */}
                  No devices registered yet. A device joins by entering its location&apos;s{" "}
                  <Link href="/admin/locations" className="text-foreground underline underline-offset-2">
                    setup code
                  </Link>
                  .
                </TableCell>
              </TableRow>
            )}

            {pageItems.map((device, index) => {
              const location = locationById.get(device.locationId)
              return (
                <TableRow key={device.id} index={index}>
                  <TableCell className="font-medium">{device.label}</TableCell>
                  <TableCell>
                    {location ? (kioskNameById.get(location.kioskId) ?? "Unassigned") : "Unassigned"}
                  </TableCell>
                  <TableCell>{location?.name ?? "Unassigned"}</TableCell>
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
                  <TableCell>
                    <TableRowActions>
                      <DeleteRowButton
                        itemLabel={device.label}
                        onConfirm={() => handleDelete(device.id)}
                        isPending={deleteDevice.isPending}
                      />
                    </TableRowActions>
                  </TableCell>
                </TableRow>
              )
            })}
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
