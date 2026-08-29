"use client"

import * as React from "react"
import type { Control, FieldValues, Path } from "react-hook-form"
import { useController } from "react-hook-form"
import { Combobox } from "@/components/ui/combobox"
import { FormField, FormGrid } from "@/components/dashboard/form-section"
import { US_CITIES, US_STATES } from "@/lib/validation/us-geo"

const CITY_OPTIONS = Array.from(new Set(US_CITIES.map((c) => c.city)))
  .sort()
  .map((city) => ({ value: city, label: city }))

const ALL_STATE_OPTIONS = US_STATES.map((s) => ({ value: s.code, label: `${s.name} (${s.code})` }))

/** City + State fields, US-only, wired directly to a react-hook-form `control` — registers both
 * sub-fields itself via `useController` so callers don't need two `<Controller>` wrappers. City
 * is a type-to-filter combobox seeded with the full `typed-usa-states` city list but accepts any
 * typed value (`allowCustomValue`) since even ~5,800 cities isn't every incorporated place.
 * State narrows to just the state(s) that city is actually in whenever the typed city matches
 * the bundled list (auto-filled outright when there's exactly one match); otherwise every state
 * stays selectable. */
export function CityStateFields<TFieldValues extends FieldValues>({
  idPrefix,
  control,
  cityName,
  stateName,
}: {
  idPrefix: string
  control: Control<TFieldValues>
  cityName: Path<TFieldValues>
  stateName: Path<TFieldValues>
}) {
  const cityField = useController({ control, name: cityName })
  const stateField = useController({ control, name: stateName })
  const city = String(cityField.field.value ?? "")

  const matchingStateCodes = React.useMemo(() => {
    const normalized = city.trim().toLowerCase()
    if (!normalized) return null
    const matches = US_CITIES.filter((c) => c.city.toLowerCase() === normalized)
    return matches.length > 0 ? matches.map((m) => m.state) : null
  }, [city])

  const stateOptions = matchingStateCodes
    ? ALL_STATE_OPTIONS.filter((s) => matchingStateCodes.includes(s.value))
    : ALL_STATE_OPTIONS

  function handleCityChange(nextCity: string) {
    cityField.field.onChange(nextCity)
    const normalized = nextCity.trim().toLowerCase()
    const matches = US_CITIES.filter((c) => c.city.toLowerCase() === normalized)
    if (matches.length === 1) {
      stateField.field.onChange(matches[0].state)
    }
  }

  return (
    <FormGrid>
      <FormField label="City" htmlFor={`${idPrefix}-city`} error={cityField.fieldState.error?.message}>
        <Combobox
          id={`${idPrefix}-city`}
          value={city}
          onValueChange={handleCityChange}
          options={CITY_OPTIONS}
          placeholder="Select or type a city"
          searchPlaceholder="Type a city..."
          allowCustomValue
          aria-invalid={!!cityField.fieldState.error}
        />
      </FormField>
      <FormField label="State" htmlFor={`${idPrefix}-state`} error={stateField.fieldState.error?.message}>
        <Combobox
          id={`${idPrefix}-state`}
          value={String(stateField.field.value ?? "")}
          onValueChange={stateField.field.onChange}
          options={stateOptions}
          placeholder="Select a state"
          searchPlaceholder="Search states..."
          aria-invalid={!!stateField.fieldState.error}
        />
      </FormField>
    </FormGrid>
  )
}
