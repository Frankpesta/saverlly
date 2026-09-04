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
import { SetupCodeCell } from "@/components/dashboard/setup-code-cell"
import { TablePagination } from "@/components/dashboard/table-pagination"
import { CollectionArea, CollectionSummary, WorkspaceHeader } from "@/components/dashboard/page-layout"
import { useDeleteLocation, useLocations } from "@/lib/api/hooks/use-locations"
import { useDevices } from "@/lib/api/hooks/use-devices"
import { useCurrentUser } from "@/lib/api/hooks/use-current-user"
import { useKioskContact } from "@/lib/api/hooks/use-kiosks"
import { ApiError } from "@/lib/api/client"
import { usePagination } from "@/hooks/use-pagination"
import { cn } from "@/lib/utils"

export default function LocationsPage() {
  const { data: locations, isLoading, isError } = useLocations()
  const { data: devices } = useDevices()
  const { data: currentUser } = useCurrentUser()
  const { page, setPage, pageCount, pageItems, totalItems, pageSize } = usePagination(locations)
  const deleteLocation = useDeleteLocation()

  // Creating and deleting locations is the owner's call. A location manager runs the sites
  // they're assigned, which is the same gate the location detail page already applies.
  const isOwner = currentUser?.role === "KIOSK_OWNER"
  // Only fetched for a manager, and only to name who to ask when they have no locations. It is
  // the same narrow projection the portal Settings page already uses.
  const { data: kioskContact } = useKioskContact(
    !!currentUser && !isOwner && locations?.length === 0,
  )

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

  function handleDelete(id: string, name: string) {
    deleteLocation.mutate(id, {
      onSuccess: () => toast.success(`${name} was deleted.`),
      onError: (error) =>
        toast.error(error instanceof ApiError ? error.message : "Could not delete location."),
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <WorkspaceHeader
        title="Locations"
        actions={
          isOwner ? (
            <Link href="/portal/locations/new" className={cn(buttonVariants(), "gap-1.5")}>
              <PlusIcon className="size-4" />
              New Location
            </Link>
          ) : undefined
        }
      />

      <CollectionSummary items={[
        { label: "Locations", value: stats.total, detail: "Operating sites" },
        { label: "Devices", value: stats.devices, detail: "Registered endpoints" },
        { label: "Cities", value: stats.cities, detail: "Areas served" },
      ]} />

      {isError && <p className="text-sm text-destructive">Could not load locations.</p>}

      <CollectionArea title="Your locations" titleHidden count={totalItems}>
        <div className="flex flex-col gap-2">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
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
                  <TableCell colSpan={6}>
                    <Skeleton className="h-6 w-full" />
                  </TableCell>
                </TableRow>
              ))}

            {!isLoading && locations?.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  {/* A manager with an empty managedLocationIds saw a blank table with no
                      explanation and nobody to ask. They can't fix it themselves, so the least
                      this can do is name the person who can. */}
                  {isOwner ? (
                    "No locations yet."
                  ) : (
                    <>
                      You have not been assigned to any locations yet. Ask{" "}
                      {kioskContact?.email ? (
                        <a
                          href={`mailto:${kioskContact.email}`}
                          className="text-[var(--brand-teal)] hover:underline"
                        >
                          {kioskContact.name || "your kiosk owner"}
                        </a>
                      ) : (
                        "your kiosk owner"
                      )}{" "}
                      to add you to one.
                    </>
                  )}
                </TableCell>
              </TableRow>
            )}

            {pageItems.map((location, index) => (
              <TableRow key={location.id} index={index}>
                {/* Name and address are free text and can be arbitrarily long. Uncapped they
                    size their column to their content and push the table past its container. */}
                <TableCell className="max-w-[180px] truncate font-medium" title={location.name}>
                  <Link href={`/portal/locations/${location.id}`} className="hover:underline">
                    {location.name}
                  </Link>
                </TableCell>
                <TableCell
                  className="max-w-[200px] truncate"
                  title={`${location.address}, ${location.city}, ${location.state}`}
                >
                  {location.address}, {location.city}, {location.state}
                </TableCell>
                {/* Capped at two visible tags, otherwise a heavily tagged location stacks a badge
                    per line and makes its row several times taller than its neighbours'. */}
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
                      href={`/portal/locations/${location.id}`}
                      className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }), "text-muted-foreground hover:text-foreground")}
                      aria-label={`Edit ${location.name}`}
                    >
                      <PencilIcon className="size-3.5" />
                    </Link>
                    {isOwner && (
                      <DeleteRowButton
                        itemLabel={location.name}
                        description="Its setup codes, devices, and all device activity history will be deleted too. This can't be undone."
                        onConfirm={() => handleDelete(location.id, location.name)}
                        isPending={deleteLocation.isPending}
                      />
                    )}
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
