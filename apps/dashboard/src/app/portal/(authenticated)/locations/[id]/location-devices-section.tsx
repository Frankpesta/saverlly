"use client"

import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { useDevices, useUpdateDevice } from "@/lib/api/hooks/use-devices"
import { ApiError } from "@/lib/api/client"
import { relativeTime } from "@/lib/relative-time"

export function LocationDevicesSection({ locationId }: { locationId: string }) {
  const { data: devices, isLoading, isError } = useDevices()
  const updateDevice = useUpdateDevice()

  const atThisLocation = devices?.filter((d) => d.locationId === locationId) ?? []

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
    <Card>
      <CardHeader>
        <CardTitle>Devices</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {isError && <p className="text-sm text-destructive">Could not load devices.</p>}
        {isLoading && <Skeleton className="h-10 w-full" />}
        {!isLoading && atThisLocation.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No devices registered at this location yet.
          </p>
        )}
        {atThisLocation.map((device) => (
          <div
            key={device.id}
            className="flex items-center justify-between rounded-lg border border-black/8 px-4 py-3"
          >
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-medium">{device.label}</span>
              <span className="text-xs text-muted-foreground">
                {device.lastSeenAt ? `Last seen ${relativeTime(device.lastSeenAt)}` : "Never seen"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={device.active ? "success" : "secondary"}>
                {device.active ? "Active" : "Disabled"}
              </Badge>
              <Switch
                checked={device.active}
                onCheckedChange={() => toggleActive(device.id, device.active)}
                disabled={updateDevice.isPending}
                aria-label={`Toggle ${device.label} status`}
              />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
