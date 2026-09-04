"use client"

import * as React from "react"
import Link from "next/link"
import { toast } from "sonner"
import { PencilIcon, PlusIcon } from "lucide-react"
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
import { DeleteRowButton } from "@/components/dashboard/delete-row-button"
import { TablePagination } from "@/components/dashboard/table-pagination"
import { CollectionArea, CollectionSummary, WorkspaceHeader } from "@/components/dashboard/page-layout"
import { useDeleteLocation, useLocations } from "@/lib/api/hooks/use-locations"
import { useDevices } from "@/lib/api/hooks/use-devices"
import { useKiosks } from "@/lib/api/hooks/use-kiosks"
import { ApiError } from "@/lib/api/client"
import { usePagination } from "@/hooks/use-pagination"
import { cn } from "@/lib/utils"
import { SetupCodeCell } from "@/components/dashboard/setup-code-cell"

export default function AdminLocationsPage() {
  const { data: locations, isLoading, isError } = useLocations()
  const { data: devices } = useDevices()
  const { data: kiosks } = useKiosks()
  const { page, setPage, pageCount, pageItems, totalItems, pageSize } = usePagination(locations)
  const deleteLocation = useDeleteLocation()

  function handleDelete(id: string, name: string) {
    deleteLocation.mutate(id, {
      onSuccess: () => toast.success(`${name} was deleted.`),
      onError: (error) =>
        toast.error(error instanceof ApiError ? error.message : "Could not delete location."),
    })
  }

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
        title="Locations"
        actions={
          <Link href="/admin/locations/new" className={cn(buttonVariants(), "gap-1.5")}>
            <PlusIcon className="size-4" />
            New Location
          </Link>
        }
      />

      <CollectionSummary items={[
        { label: "Locations", value: stats.total, detail: "Across the platform" },
        { label: "Devices", value: stats.devices, detail: "Registered endpoints" },
        { label: "Kiosks represented", value: stats.kiosks, detail: "With live locations" },
      ]} />

      {isError && <p className="text-sm text-destructive">Could not load locations.</p>}

      <CollectionArea title="Location directory" titleHidden count={totalItems}>
      <div className="flex flex-col gap-2">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Kiosk</TableHead>
              <TableHead>Address</TableHead>
              <TableHead>Tags</TableHead>
              <TableHead>Setup code</TableHead>
              <TableHead>Devices</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={7}>
                    <Skeleton className="h-6 w-full" />
                  </TableCell>
                </TableRow>
              ))}

            {!isLoading && locations?.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  No locations yet.
                </TableCell>
              </TableRow>
            )}

            {pageItems.map((location, index) => (
              <TableRow key={location.id} index={index}>
                {/* Name/Kiosk/Address are all free-text and can be arbitrarily long. Without a
                    cap they size the column to their content and push the table past its
                    container (a real overflow at ~1000px in a 911px container before this).
                    The container still scrolls on genuinely narrow viewports; these caps are
                    what stop it needing to at a normal width. */}
                <TableCell className="max-w-[180px] truncate font-medium" title={location.name}>
                  <Link href={`/admin/locations/${location.id}`} className="hover:underline">
                    {location.name}
                  </Link>
                </TableCell>
                <TableCell className="max-w-[160px] truncate" title={kioskNameById.get(location.kioskId) ?? "Unassigned"}>
                  {kioskNameById.get(location.kioskId) ?? "Unassigned"}
                </TableCell>
                <TableCell
                  className="max-w-[170px] truncate"
                  title={`${location.address}, ${location.city}, ${location.state}`}
                >
                  {location.address}, {location.city}, {location.state}
                </TableCell>
                {/* Capped at two visible tags. A location with several tags otherwise stacks a
                    badge per line and makes its row two or three times taller than its
                    neighbours'. The full list is on the location's own page. */}
                <TableCell className="max-w-[150px]">
                  <div className="flex flex-nowrap items-center gap-1">
                    {location.tags.length === 0 && (
                      <span className="text-muted-foreground">No tags</span>
                    )}
                    {location.tags.slice(0, 2).map((tag) => (
                      <Badge key={tag} variant="secondary" className="max-w-[80px] truncate">
                        {tag}
                      </Badge>
                    ))}
                    {location.tags.length > 2 && (
                      <span
                        className="shrink-0 text-meta text-muted-foreground"
                        title={location.tags.slice(2).join(", ")}
                      >
                        +{location.tags.length - 2}
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <SetupCodeCell location={location} />
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
                    <DeleteRowButton
                      itemLabel={location.name}
                      description="Its setup codes, devices, and all device activity history will be deleted too. This can't be undone."
                      onConfirm={() => handleDelete(location.id, location.name)}
                      isPending={deleteLocation.isPending}
                    />
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
