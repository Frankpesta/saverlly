"use client"

import * as React from "react"
import { motion } from "motion/react"
import { toast } from "sonner"
import { MonitorIcon, CircleCheckIcon, CirclePauseIcon } from "lucide-react"
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
import { BentoGrid } from "@/components/dashboard/bento-grid"
import { StatTile } from "@/components/dashboard/stat-tile"
import { useDevices, useUpdateDevice } from "@/lib/api/hooks/use-devices"
import { useLocations } from "@/lib/api/hooks/use-locations"
import { useKiosks } from "@/lib/api/hooks/use-kiosks"
import { ApiError } from "@/lib/api/client"
import { relativeTime } from "@/lib/relative-time"

const ONLINE_THRESHOLD_MS = 60 * 60 * 1000 // 1 hour — matches the extension's own grace window

export default function AdminDevicesPage() {
  const { data: devices, isLoading, isError } = useDevices()
  const { data: locations } = useLocations()
  const { data: kiosks } = useKiosks()
  const updateDevice = useUpdateDevice()

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
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Devices</h2>
        <p className="text-sm text-muted-foreground">
          Every device registered across every kiosk on the platform.
        </p>
      </div>

      <BentoGrid>
        <StatTile label="Total devices" value={stats.total} icon={<MonitorIcon />} />
        <StatTile label="Active" value={stats.active} icon={<CircleCheckIcon />} />
        <StatTile label="Seen in the last hour" value={stats.online} icon={<CirclePauseIcon />} />
      </BentoGrid>

      {isError && <p className="text-sm text-destructive">Could not load devices.</p>}

      <div className="overflow-hidden rounded-2xl border border-black/8">
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

            {devices?.map((device, index) => {
              const location = locationById.get(device.locationId)
              return (
                <motion.tr
                  key={device.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, delay: index * 0.03 }}
                  className="border-b border-black/6 transition-colors last:border-0 hover:bg-[var(--brand-teal-tint)]/50"
                >
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
                      <Badge variant={device.active ? "default" : "secondary"}>
                        {device.active ? "Active" : "Disabled"}
                      </Badge>
                    </div>
                  </TableCell>
                </motion.tr>
              )
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
