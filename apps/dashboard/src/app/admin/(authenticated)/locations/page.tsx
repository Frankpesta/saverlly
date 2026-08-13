"use client"

import * as React from "react"
import Link from "next/link"
import { motion } from "motion/react"
import { MapPinIcon, MonitorIcon, StoreIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
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
import { StatTile } from "@/components/dashboard/stat-tile"
import { useLocations } from "@/lib/api/hooks/use-locations"
import { useDevices } from "@/lib/api/hooks/use-devices"
import { useKiosks } from "@/lib/api/hooks/use-kiosks"
import { NewLocationDialog } from "./new-location-dialog"

export default function AdminLocationsPage() {
  const { data: locations, isLoading, isError } = useLocations()
  const { data: devices } = useDevices()
  const { data: kiosks } = useKiosks()

  const kioskNameById = React.useMemo(() => {
    const map = new Map<string, string>()
    for (const kiosk of kiosks ?? []) map.set(kiosk.id, kiosk.name)
    return map
  }, [kiosks])

  const deviceCountByLocation = React.useMemo(() => {
    const counts = new Map<string, number>()
    for (const device of devices ?? []) {
      counts.set(device.locationId, (counts.get(device.locationId) ?? 0) + 1)
    }
    return counts
  }, [devices])

  const stats = React.useMemo(() => {
    const list = locations ?? []
    const kioskCount = new Set(list.map((l) => l.kioskId)).size
    return { total: list.length, devices: devices?.length ?? 0, kiosks: kioskCount }
  }, [locations, devices])

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Locations</h2>
          <p className="text-sm text-muted-foreground">
            Every location across every kiosk business on the platform.
          </p>
        </div>
        <NewLocationDialog />
      </div>

      <BentoGrid>
        <StatTile label="Total locations" value={stats.total} icon={<MapPinIcon />} />
        <StatTile label="Total devices" value={stats.devices} icon={<MonitorIcon />} />
        <StatTile label="Kiosks represented" value={stats.kiosks} icon={<StoreIcon />} />
      </BentoGrid>

      {isError && <p className="text-sm text-destructive">Could not load locations.</p>}

      <div className="overflow-hidden rounded-2xl border border-black/8">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Kiosk</TableHead>
              <TableHead>Address</TableHead>
              <TableHead>Tags</TableHead>
              <TableHead>Devices</TableHead>
              <TableHead className="w-10" />
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

            {!isLoading && locations?.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  No locations yet.
                </TableCell>
              </TableRow>
            )}

            {locations?.map((location, index) => (
              <motion.tr
                key={location.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: index * 0.03 }}
                className="border-b border-black/6 transition-colors last:border-0 hover:bg-[var(--brand-teal-tint)]/50"
              >
                <TableCell className="font-medium">
                  <Link href={`/admin/locations/${location.id}`} className="hover:underline">
                    {location.name}
                  </Link>
                </TableCell>
                <TableCell>{kioskNameById.get(location.kioskId) ?? "—"}</TableCell>
                <TableCell>
                  {location.address}, {location.city}, {location.state}
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {location.tags.length === 0 && (
                      <span className="text-muted-foreground">—</span>
                    )}
                    {location.tags.map((tag) => (
                      <Badge key={tag} variant="secondary">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell>{deviceCountByLocation.get(location.id) ?? 0}</TableCell>
                <TableCell>
                  <Link
                    href={`/admin/locations/${location.id}`}
                    className="text-sm text-muted-foreground hover:underline"
                  >
                    Edit
                  </Link>
                </TableCell>
              </motion.tr>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
