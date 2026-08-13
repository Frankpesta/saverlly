"use client"

import * as React from "react"
import Link from "next/link"
import { motion } from "motion/react"
import { MapPinIcon, MonitorIcon, BuildingIcon } from "lucide-react"
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
import { TablePagination } from "@/components/dashboard/table-pagination"
import { useLocations } from "@/lib/api/hooks/use-locations"
import { useDevices } from "@/lib/api/hooks/use-devices"
import { useCurrentUser } from "@/lib/api/hooks/use-current-user"
import { usePagination } from "@/hooks/use-pagination"
import { NewLocationDialog } from "./new-location-dialog"

export default function LocationsPage() {
  const { data: locations, isLoading, isError } = useLocations()
  const { data: devices } = useDevices()
  const { data: currentUser } = useCurrentUser()
  const { page, setPage, pageCount, pageItems, totalItems, pageSize } = usePagination(locations)

  const deviceCountByLocation = React.useMemo(() => {
    const counts = new Map<string, number>()
    for (const device of devices ?? []) {
      counts.set(device.locationId, (counts.get(device.locationId) ?? 0) + 1)
    }
    return counts
  }, [devices])

  const stats = React.useMemo(() => {
    const list = locations ?? []
    const cities = new Set(list.map((l) => l.city))
    return { total: list.length, devices: devices?.length ?? 0, cities: cities.size }
  }, [locations, devices])

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-5 rounded-3xl border border-[var(--brand-teal-soft)] bg-[linear-gradient(120deg,#ffffff_0%,#f0faf8_100%)] p-6 sm:flex-row sm:items-end sm:justify-between sm:p-8">
        <div className="max-w-2xl">
          <p className="mb-2 text-xs font-semibold tracking-[0.16em] text-[var(--brand-teal)] uppercase">Operations</p>
          <h2 className="text-3xl font-semibold tracking-[-0.04em]">Locations</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Every physical location your kiosk business operates from.
          </p>
        </div>
        {currentUser?.role === "KIOSK_OWNER" && <NewLocationDialog />}
      </div>

      <BentoGrid>
        <StatTile label="Total locations" value={stats.total} icon={<MapPinIcon />} />
        <StatTile label="Total devices" value={stats.devices} icon={<MonitorIcon />} />
        <StatTile label="Cities" value={stats.cities} icon={<BuildingIcon />} />
      </BentoGrid>

      {isError && <p className="text-sm text-destructive">Could not load locations.</p>}

      <section className="overflow-hidden rounded-2xl border border-black/[0.06] bg-card shadow-[0_8px_24px_rgba(11,11,11,0.04)]">
        <div className="flex flex-col gap-1 border-b border-border/70 px-5 py-4 sm:px-6">
          <h3 className="font-semibold tracking-tight">Your locations</h3>
          <p className="text-sm text-muted-foreground">Review locations, addresses, tags, and connected devices.</p>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
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
                  <TableCell colSpan={5}>
                    <Skeleton className="h-6 w-full" />
                  </TableCell>
                </TableRow>
              ))}

            {!isLoading && locations?.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  No locations yet.
                </TableCell>
              </TableRow>
            )}

            {pageItems.map((location, index) => (
              <motion.tr
                key={location.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: index * 0.03 }}
                className="border-b border-black/6 transition-colors last:border-0 hover:bg-[var(--brand-teal-tint)]/50"
              >
                <TableCell className="font-medium">
                  <Link href={`/portal/locations/${location.id}`} className="hover:underline">
                    {location.name}
                  </Link>
                </TableCell>
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
                    href={`/portal/locations/${location.id}`}
                    className="text-sm text-muted-foreground hover:underline"
                  >
                    Edit
                  </Link>
                </TableCell>
              </motion.tr>
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
      </section>
    </div>
  )
}
