"use client"

import * as React from "react"
import Link from "next/link"
import { PencilIcon } from "lucide-react"
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
import { useLocations } from "@/lib/api/hooks/use-locations"
import { useDevices } from "@/lib/api/hooks/use-devices"
import { useKiosks } from "@/lib/api/hooks/use-kiosks"
import { usePagination } from "@/hooks/use-pagination"
import { cn } from "@/lib/utils"
import { NewLocationDialog } from "./new-location-dialog"

export default function AdminLocationsPage() {
  const { data: locations, isLoading, isError } = useLocations()
  const { data: devices } = useDevices()
  const { data: kiosks } = useKiosks()
  const { page, setPage, pageCount, pageItems, totalItems, pageSize } = usePagination(locations)

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
      <WorkspaceHeader
        eyebrow="Platform network"
        title="Locations"
        description="Every location across every kiosk business on the platform."
        actions={<NewLocationDialog />}
      />

      <CollectionSummary items={[
        { label: "Locations", value: stats.total, detail: "Across the platform" },
        { label: "Devices", value: stats.devices, detail: "Registered endpoints" },
        { label: "Kiosks represented", value: stats.kiosks, detail: "With live locations" },
      ]} />

      {isError && <p className="text-sm text-destructive">Could not load locations.</p>}

      <CollectionArea title="Location directory" description="Review locations, their kiosk ownership, and attached devices." count={totalItems}>
      <div className="flex flex-col gap-2">
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

            {pageItems.map((location, index) => (
              <TableRow key={location.id} index={index}>
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
                  <TableRowActions>
                    <Link
                      href={`/admin/locations/${location.id}`}
                      className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }), "text-muted-foreground hover:text-foreground")}
                      aria-label={`Edit ${location.name}`}
                    >
                      <PencilIcon className="size-3.5" />
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
