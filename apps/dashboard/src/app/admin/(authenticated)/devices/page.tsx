"use client"

import * as React from "react"
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
} from "@/components/ui/table"
import { TablePagination } from "@/components/dashboard/table-pagination"
import { CollectionArea, CollectionSummary, WorkspaceHeader } from "@/components/dashboard/page-layout"
import { useDevices, useUpdateDevice } from "@/lib/api/hooks/use-devices"
import { useLocations } from "@/lib/api/hooks/use-locations"
import { useKiosks } from "@/lib/api/hooks/use-kiosks"
import { ApiError } from "@/lib/api/client"
import { relativeTime } from "@/lib/relative-time"
import { usePagination } from "@/hooks/use-pagination"

const ONLINE_THRESHOLD_MS = 60 * 60 * 1000 // 1 hour — matches the extension's own grace window

export default function AdminDevicesPage() {
  const { data: devices, isLoading, isError } = useDevices()
  const { data: locations } = useLocations()
  const { data: kiosks } = useKiosks()
  const updateDevice = useUpdateDevice()
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

  return (
    <div className="flex flex-col gap-6">
      <WorkspaceHeader
        eyebrow="Platform network"
        title="Devices"
        description="Every device registered across every kiosk on the platform."
      />

      <CollectionSummary items={[
        { label: "Devices", value: stats.total, detail: "Registered endpoints" },
        { label: "Active", value: stats.active, detail: "Available to report" },
        { label: "Seen in the last hour", value: stats.online, detail: "Currently responsive" },
      ]} />

      {isError && <p className="text-sm text-destructive">Could not load devices.</p>}

      <CollectionArea title="Device directory" description="Review device health across the platform and manage each endpoint." count={totalItems}>
      <div className="flex flex-col gap-2">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Device</TableHead>
              <TableHead>Kiosk</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Last seen</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={5}>
                    <Skeleton className="h-6 w-full" />
                  </TableCell>
                </TableRow>
              ))}

            {!isLoading && devices?.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  No devices registered yet.
                </TableCell>
              </TableRow>
            )}

            {pageItems.map((device, index) => {
              const location = locationById.get(device.locationId)
              return (
                <TableRow key={device.id} index={index}>
                  <TableCell className="font-medium">{device.label}</TableCell>
                  <TableCell>
                    {location ? (kioskNameById.get(location.kioskId) ?? "—") : "—"}
                  </TableCell>
                  <TableCell>{location?.name ?? "—"}</TableCell>
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
                      <Badge variant={device.active ? "success" : "secondary"}>
                        {device.active ? "Active" : "Disabled"}
                      </Badge>
                    </div>
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
