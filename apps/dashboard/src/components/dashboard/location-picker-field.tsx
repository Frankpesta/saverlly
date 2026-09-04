"use client"

import Link from "next/link"
import { Checkbox } from "@/components/ui/checkbox"
import { Skeleton } from "@/components/ui/skeleton"
import { useLocations } from "@/lib/api/hooks/use-locations"

/**
 * The list of locations a team member is allowed to see, as real checkboxes.
 *
 * Shared by the create and edit team-member pages and by the Managers card on a location's own
 * page, so "which locations does this person cover" reads the same wherever it's asked. It used
 * to exist only inside an edit dialog, which is why a new team member could not be given a
 * location until after they had been created.
 */
export function LocationPickerField({
  idPrefix,
  value,
  onChange,
  newLocationHref,
}: {
  idPrefix: string
  value: string[]
  onChange: (next: string[]) => void
  /** Where to send someone who has no locations yet. Omitted for a manager, who can't add one. */
  newLocationHref?: string
}) {
  const { data: locations, isLoading } = useLocations()

  function toggle(locationId: string) {
    onChange(
      value.includes(locationId)
        ? value.filter((id) => id !== locationId)
        : [...value, locationId],
    )
  }

  if (isLoading) {
    return <Skeleton className="h-24 w-full rounded-lg" />
  }

  if (!locations?.length) {
    return (
      <p className="rounded-lg border border-dashed border-black/12 px-4 py-6 text-center text-sm text-muted-foreground dark:border-white/12">
        You have no locations yet.
        {newLocationHref && (
          <>
            {" "}
            <Link href={newLocationHref} className="text-[var(--brand-teal)] hover:underline">
              Add one
            </Link>{" "}
            first.
          </>
        )}
      </p>
    )
  }

  return (
    <div className="flex max-h-64 flex-col gap-0.5 overflow-y-auto rounded-lg border border-black/8 p-1.5 dark:border-white/10">
      {locations.map((location) => {
        const id = `${idPrefix}-location-${location.id}`
        return (
          <label
            key={location.id}
            htmlFor={id}
            className="flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-sm hover:bg-accent"
          >
            <Checkbox
              id={id}
              checked={value.includes(location.id)}
              onCheckedChange={() => toggle(location.id)}
            />
            <span className="min-w-0 flex-1 truncate">{location.name}</span>
            <span className="shrink-0 text-meta text-muted-foreground">
              {location.city}, {location.state}
            </span>
          </label>
        )
      })}
    </div>
  )
}
