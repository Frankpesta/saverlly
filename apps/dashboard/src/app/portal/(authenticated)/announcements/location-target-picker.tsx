"use client"

import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import type { Location } from "@/lib/api/types"

export function LocationTargetPicker({
  locations,
  value,
  onChange,
  canTargetAllLocations = true,
}: {
  locations: Location[]
  /** Empty array means "all locations". The same convention the backend uses. */
  value: string[]
  onChange: (locationIds: string[]) => void
  /**
   * False for a location manager. "All locations" means every location in the kiosk, which is
   * the owner's call, so a manager names their own explicitly. The backend enforces the same
   * rule; this stops them designing a whole announcement only to be refused on submit.
   */
  canTargetAllLocations?: boolean
}) {
  const allLocations = canTargetAllLocations && value.length === 0

  function toggleAllLocations(checked: boolean) {
    onChange(checked ? [] : locations.map((l) => l.id))
  }

  function toggleLocation(locationId: string, checked: boolean) {
    onChange(checked ? [...value, locationId] : value.filter((id) => id !== locationId))
  }

  return (
    <div className="flex flex-col gap-3">
      {canTargetAllLocations && (
        <div className="flex items-center justify-between gap-4">
          <div>
            <Label htmlFor="all-locations-toggle">All locations</Label>
            <p className="text-sm text-muted-foreground">
              {locations.length === 0
                ? "You have no locations yet, so this is the only option."
                : "Show at every location, or pick specific ones."}
            </p>
          </div>
          {/* Disabled with nothing to pick from: turning it off would call onChange([]) on an
              empty list, which reads back as "all locations" and snaps the switch straight on
              again, so it looked stuck. */}
          <Switch
            id="all-locations-toggle"
            checked={allLocations}
            disabled={locations.length === 0}
            onCheckedChange={toggleAllLocations}
          />
        </div>
      )}

      {!canTargetAllLocations && (
        <p className="text-sm text-muted-foreground">
          Pick which of your locations this is for. Only the kiosk owner can announce to every
          location.
        </p>
      )}

      {!allLocations && (
        <div className="flex flex-col gap-2 rounded-lg border border-black/8 p-3 dark:border-white/10">
          {locations.length === 0 && (
            <p className="text-sm text-muted-foreground">
              {canTargetAllLocations
                ? "No locations to choose from yet."
                : "You have not been assigned any locations yet, so there is nowhere to show this."}
            </p>
          )}
          {locations.map((location) => (
            <label
              key={location.id}
              className="flex items-center gap-2 text-sm"
              htmlFor={`location-${location.id}`}
            >
              <Checkbox
                id={`location-${location.id}`}
                checked={value.includes(location.id)}
                onCheckedChange={(checked) => toggleLocation(location.id, checked === true)}
              />
              {location.name}
            </label>
          ))}
        </div>
      )}
    </div>
  )
}
