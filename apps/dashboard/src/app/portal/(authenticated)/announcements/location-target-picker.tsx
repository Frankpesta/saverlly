"use client"

import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import type { Location } from "@/lib/api/types"

export function LocationTargetPicker({
  locations,
  value,
  onChange,
}: {
  locations: Location[]
  /** Empty array means "all locations". The same convention the backend uses. */
  value: string[]
  onChange: (locationIds: string[]) => void
}) {
  const allLocations = value.length === 0

  function toggleAllLocations(checked: boolean) {
    onChange(checked ? [] : locations.map((l) => l.id))
  }

  function toggleLocation(locationId: string, checked: boolean) {
    onChange(checked ? [...value, locationId] : value.filter((id) => id !== locationId))
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div>
          <Label htmlFor="all-locations-toggle">All locations</Label>
          <p className="text-sm text-muted-foreground">
            Show at every location, or pick specific ones.
          </p>
        </div>
        <Switch
          id="all-locations-toggle"
          checked={allLocations}
          onCheckedChange={toggleAllLocations}
        />
      </div>

      {!allLocations && (
        <div className="flex flex-col gap-2 rounded-lg border border-black/8 p-3 dark:border-white/10">
          {locations.length === 0 && (
            <p className="text-sm text-muted-foreground">No locations to choose from yet.</p>
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
