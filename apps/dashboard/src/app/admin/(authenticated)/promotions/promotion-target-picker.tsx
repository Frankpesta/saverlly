"use client"

import * as React from "react"
import { GlobeIcon } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { TagInput } from "@/components/dashboard/tag-input"
import { FormField } from "@/components/dashboard/form-section"
import type { Location } from "@/lib/api/types"

/**
 * Promotion targeting is a *union*: a device sees the promo if its location matches either a tag
 * or an explicitly-picked location. That's deliberately different from the announcement picker's
 * kiosk-scoped "all locations or these ones" model, so this is its own component rather than a
 * prop on that one.
 */
export function PromotionTargetPicker({
  locations,
  everywhere,
  tags,
  locationIds,
  error,
  onEverywhereChange,
  onTagsChange,
  onLocationIdsChange,
}: {
  locations: Location[]
  /** A real form field, not `tags.length === 0 && locationIds.length === 0`. Deriving it meant
   * turning the switch off wrote empty arrays, which recomputed back to "everywhere" and
   * snapped the switch on again, so the pickers below could never be reached. */
  everywhere: boolean
  tags: string[]
  locationIds: string[]
  error?: string
  onEverywhereChange: (everywhere: boolean) => void
  onTagsChange: (tags: string[]) => void
  onLocationIdsChange: (locationIds: string[]) => void
}) {
  function toggleLocation(locationId: string, checked: boolean) {
    onLocationIdsChange(
      checked ? [...locationIds, locationId] : locationIds.filter((id) => id !== locationId),
    )
  }

  // Tags actually in use across real locations. Shown as one-click suggestions so an admin
  // doesn't have to guess at spelling and silently target nothing.
  const knownTags = React.useMemo(() => {
    const seen = new Map<string, string>()
    for (const location of locations) {
      for (const tag of location.tags ?? []) {
        const key = tag.trim().toLowerCase()
        if (key && !seen.has(key)) seen.set(key, tag.trim())
      }
    }
    return [...seen.values()].sort((a, b) => a.localeCompare(b))
  }, [locations])

  const unusedSuggestions = knownTags.filter(
    (tag) => !tags.some((t) => t.trim().toLowerCase() === tag.toLowerCase()),
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between rounded-lg border border-black/8 p-3 dark:border-white/10">
        <div>
          <Label htmlFor="promo-everywhere">Show everywhere</Label>
          <p className="text-sm text-muted-foreground">
            Every device on the platform, regardless of location.
          </p>
        </div>
        <Switch
          id="promo-everywhere"
          checked={everywhere}
          onCheckedChange={onEverywhereChange}
        />
      </div>

      {everywhere ? (
        <div className="flex items-center gap-2 rounded-lg border border-dashed border-black/12 p-4 text-sm text-muted-foreground dark:border-white/15">
          <GlobeIcon className="size-4 shrink-0" />
          This promotion will show on every device across every kiosk.
        </div>
      ) : (
        <>
          <FormField
            label="Location tags"
            htmlFor="promo-tags"
            hint="Matches any location carrying one of these tags. Case doesn't matter."
            error={error}
          >
            <TagInput
              id="promo-tags"
              value={tags}
              onChange={onTagsChange}
              placeholder="mall, downtown…"
            />
          </FormField>

          {unusedSuggestions.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Tags in use:</span>
              {unusedSuggestions.map((tag) => (
                <button key={tag} type="button" onClick={() => onTagsChange([...tags, tag])}>
                  <Badge
                    variant="secondary"
                    className="cursor-pointer font-normal hover:bg-secondary/70"
                  >
                    + {tag}
                  </Badge>
                </button>
              ))}
            </div>
          )}

          <div className="flex flex-col gap-2">
            <Label>Specific locations</Label>
            <p className="-mt-1 text-sm text-muted-foreground">
              Added on top of any tag matches above, not narrowed by them.
            </p>
            <div className="flex max-h-56 flex-col gap-2 overflow-y-auto rounded-lg border border-black/8 p-3 dark:border-white/10">
              {locations.length === 0 && (
                <p className="text-sm text-muted-foreground">No locations to choose from yet.</p>
              )}
              {locations.map((location) => (
                <label
                  key={location.id}
                  className="flex items-center gap-2 text-sm"
                  htmlFor={`promo-location-${location.id}`}
                >
                  <Checkbox
                    id={`promo-location-${location.id}`}
                    checked={locationIds.includes(location.id)}
                    onCheckedChange={(checked) => toggleLocation(location.id, checked === true)}
                  />
                  <span>{location.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {location.city}, {location.state}
                  </span>
                </label>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
