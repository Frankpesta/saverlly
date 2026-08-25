"use client"

import * as React from "react"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
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
    <div className="flex flex-col gap-6">
      <WorkspaceHeader
        eyebrow="Operations"
        title="Locations"
        description="Every physical location your kiosk business operates from."
        actions={currentUser?.role === "KIOSK_OWNER" ? <NewLocationDialog /> : undefined}
      />

      <CollectionSummary items={[
        { label: "Locations", value: stats.total, detail: "Operating sites" },
        { label: "Devices", value: stats.devices, detail: "Registered endpoints" },
        { label: "Cities", value: stats.cities, detail: "Areas served" },
      ]} />

      {isError && <p className="text-sm text-destructive">Could not load locations.</p>}

      <CollectionArea title="Your locations" description="Review locations, addresses, tags, and connected devices." count={totalItems}>
        <div className="flex flex-col gap-2">
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
              <TableRow key={location.id} index={index}>
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
                  <TableRowActions>
                    <Link
                      href={`/portal/locations/${location.id}`}
                      className="text-sm text-muted-foreground hover:underline"
                    >
                      Edit
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
