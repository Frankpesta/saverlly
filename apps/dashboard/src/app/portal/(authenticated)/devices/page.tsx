"use client"

import * as React from "react"
import { toast } from "sonner"
import { DownloadIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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
import { useCurrentUser } from "@/lib/api/hooks/use-current-user"
import { ApiError } from "@/lib/api/client"
import { relativeTime } from "@/lib/relative-time"
import { usePagination } from "@/hooks/use-pagination"

const ONLINE_THRESHOLD_MS = 60 * 60 * 1000 // 1 hour — matches the extension's own grace window

export default function DevicesPage() {
  const { data: devices, isLoading, isError } = useDevices()
  const { data: locations } = useLocations()
  const { data: currentUser } = useCurrentUser()
  const isKioskOwner = currentUser?.role === "KIOSK_OWNER"
  const updateDevice = useUpdateDevice()
  const deleteDevice = useDeleteDevice()
  const { page, setPage, pageCount, pageItems, totalItems, pageSize } = usePagination(devices)

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
      <WorkspaceHeader
        eyebrow="Device management"
        title="Devices"
        description="Every device registered across your locations."
        actions={process.env.NEXT_PUBLIC_AGENT_DOWNLOAD_URL ? (
          <div className="flex flex-col items-end gap-1">
            <Button type="button" variant="outline" className="gap-1.5" asChild>
              <a href={process.env.NEXT_PUBLIC_AGENT_DOWNLOAD_URL} download>
                <DownloadIcon className="size-4" />
                Download Agent
              </a>
            </Button>
            <p className="text-xs text-muted-foreground">
              Run the installer and follow the setup wizard.
            </p>
          </div>
        ) : (
          <Button
            type="button"
            variant="outline"
            className="gap-1.5"
            onClick={() =>
              toast.info("Agent download isn't available yet — check back soon.")
            }
          >
            <DownloadIcon className="size-4" />
            Download Agent
          </Button>
        )}
      />

      <CollectionSummary items={[
        { label: "Devices", value: stats.total, detail: "Registered endpoints" },
        { label: "Active", value: stats.active, detail: "Available to report" },
        { label: "Seen in the last hour", value: stats.online, detail: "Currently responsive" },
      ]} />

      {isError && <p className="text-sm text-destructive">Could not load devices.</p>}

      <CollectionArea title="Device directory" description="Review device health and manage whether each endpoint is active." count={totalItems}>
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

            {!isLoading && devices?.length === 0 && (
              <TableRow>
                <TableCell colSpan={isKioskOwner ? 5 : 4} className="text-center text-muted-foreground">
                  No devices registered yet.
                </TableCell>
              </TableRow>
            )}

            {pageItems.map((device, index) => (
              <TableRow key={device.id} index={index}>
                <TableCell className="font-medium">{device.label}</TableCell>
                <TableCell>{locationNameById.get(device.locationId) ?? "—"}</TableCell>
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
