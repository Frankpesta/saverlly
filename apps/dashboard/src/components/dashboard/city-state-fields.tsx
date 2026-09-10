"use client"

import * as React from "react"
import type { Control, FieldValues, Path } from "react-hook-form"
import { useController } from "react-hook-form"
import { Combobox } from "@/components/ui/combobox"
import { FormField, FormGrid } from "@/components/dashboard/form-section"
import { US_CITIES, US_STATES } from "@/lib/validation/us-geo"

const ALL_CITY_OPTIONS = Array.from(new Set(US_CITIES.map((c) => c.city)))
  .sort()
  .map((city) => ({ value: city, label: city }))

const ALL_STATE_OPTIONS = US_STATES.map((s) => ({ value: s.code, label: `${s.name} (${s.code})` }))

const STATE_OPTIONS_BY_CITY = new Map<string, { value: string; label: string }[]>()
for (const [city, group] of Map.groupBy(US_CITIES, (c) => c.city.toLowerCase())) {
  const codes = new Set(group.map((c) => c.state))
  STATE_OPTIONS_BY_CITY.set(
    city,
    ALL_STATE_OPTIONS.filter((option) => codes.has(option.value)),
  )
}

/** City + State fields, US-only, wired directly to a react-hook-form `control`. Registers both
 * sub-fields itself via `useController` so callers don't need two `<Controller>` wrappers.
 *
 * Rendered State-first, City-second per the client's layout preference, but the *dependency*
 * still runs City -> State underneath: typing/selecting a city narrows the State dropdown to
 * just the state(s) that city actually exists in (a name like "Springfield" spans dozens of
 * states), and auto-fills State outright when the city has exactly one match. City itself always
 * searches the full ~29,500-city list and accepts any typed value (`allowCustomValue`), since
 * even that list isn't every unincorporated place. Visual order and data dependency are
 * independent here on purpose -- don't assume swapping one implies swapping the other. */
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
  const state = String(stateField.field.value ?? "")
  const city = String(cityField.field.value ?? "")

  const stateOptionsForCity = city ? STATE_OPTIONS_BY_CITY.get(city.trim().toLowerCase()) : undefined
  const stateOptions = stateOptionsForCity ?? ALL_STATE_OPTIONS

  function handleCityChange(nextCity: string) {
    cityField.field.onChange(nextCity)
    const matches = STATE_OPTIONS_BY_CITY.get(nextCity.trim().toLowerCase())
    if (matches?.length === 1) {
      stateField.field.onChange(matches[0].value)
    }
  }

  return (
    <FormGrid>
      <FormField label="State" htmlFor={`${idPrefix}-state`} error={stateField.fieldState.error?.message}>
        <Combobox
          id={`${idPrefix}-state`}
          value={state}
          onValueChange={stateField.field.onChange}
          options={stateOptions}
          placeholder={stateOptionsForCity ? "Select the matching state" : "Select a state"}
          searchPlaceholder="Search states..."
          aria-invalid={!!stateField.fieldState.error}
        />
      </FormField>
      <FormField label="City" htmlFor={`${idPrefix}-city`} error={cityField.fieldState.error?.message}>
        <Combobox
          id={`${idPrefix}-city`}
          value={city}
          onValueChange={handleCityChange}
          options={ALL_CITY_OPTIONS}
          placeholder="Select or type a city"
          searchPlaceholder="Type a city..."
          allowCustomValue
          aria-invalid={!!cityField.fieldState.error}
        />
      </FormField>
    </FormGrid>
  )
}
