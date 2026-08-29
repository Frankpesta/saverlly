"use client"

import * as React from "react"
import Link from "next/link"
import { toast } from "sonner"
import { ExternalLinkIcon } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { DeleteRowButton } from "@/components/dashboard/delete-row-button"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { TagInput } from "@/components/dashboard/tag-input"
import { useLocations, useUpdateLocation, useDeleteLocation } from "@/lib/api/hooks/use-locations"
import { ApiError } from "@/lib/api/client"
import type { Location } from "@/lib/api/types"

/** Every location under this kiosk, editable (name + tags) inline without leaving the page —
 * full address/city/state editing still lives on the location's own detail page, linked here. */
export function KioskLocationsSection({ kioskId }: { kioskId: string }) {
  const { data: locations, isLoading, isError } = useLocations()
  const kioskLocations = React.useMemo(
    () => (locations ?? []).filter((l) => l.kioskId === kioskId),
    [locations, kioskId],
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle>Locations</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {isError && <p className="text-sm text-destructive">Could not load locations.</p>}
        {isLoading && <Skeleton className="h-10 w-full" />}
        {!isLoading && kioskLocations.length === 0 && (
          <p className="text-sm text-muted-foreground">No locations on this kiosk yet.</p>
        )}
        {kioskLocations.map((location) => (
          <LocationRow key={location.id} location={location} />
        ))}
      </CardContent>
    </Card>
  )
}

function LocationRow({ location }: { location: Location }) {
  const [name, setName] = React.useState(location.name)
  const [tags, setTags] = React.useState<string[]>(location.tags)
  const updateLocation = useUpdateLocation(location.id)
  const deleteLocation = useDeleteLocation()

  function handleSave() {
    updateLocation.mutate(
      { name, tags },
      {
        onSuccess: () => toast.success("Location updated."),
        onError: (error) =>
          toast.error(error instanceof ApiError ? error.message : "Could not update location."),
      },
    )
  }

  function handleDelete() {
    deleteLocation.mutate(location.id, {
      onSuccess: () => toast.success("Location deleted."),
      onError: (error) =>
        toast.error(error instanceof ApiError ? error.message : "Could not delete location."),
    })
  }

  const dirty =
    name !== location.name ||
    tags.length !== location.tags.length ||
    tags.some((tag, i) => tag !== location.tags[i])

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-black/8 px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <Link
          href={`/admin/locations/${location.id}`}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          {location.address}, {location.city}, {location.state}
          <ExternalLinkIcon className="size-3" />
        </Link>
        <DeleteRowButton
          itemLabel={location.name}
          description="Its setup codes, devices, and all device activity history will be deleted too. This can't be undone."
          onConfirm={handleDelete}
          isPending={deleteLocation.isPending}
        />
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name"
          className="sm:flex-1"
        />
        <div className="sm:flex-1">
          <TagInput value={tags} onChange={setTags} placeholder="Tags, comma separated" />
        </div>
        <Button
          type="button"
          size="sm"
          disabled={!dirty || updateLocation.isPending}
          onClick={handleSave}
          className="sm:mt-0.5"
        >
          {updateLocation.isPending ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  )
}
