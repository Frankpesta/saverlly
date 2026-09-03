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

const CITY_OPTIONS_BY_STATE = new Map<string, { value: string; label: string }[]>()
for (const state of US_STATES) {
  const cities = Array.from(
    new Set(US_CITIES.filter((c) => c.state === state.code).map((c) => c.city)),
  ).sort()
  CITY_OPTIONS_BY_STATE.set(state.code, cities.map((city) => ({ value: city, label: city })))
}

const STATE_OPTIONS = US_STATES.map((s) => ({ value: s.code, label: `${s.name} (${s.code})` }))

/** State + City fields, US-only, wired directly to a react-hook-form `control`. Registers both
 * sub-fields itself via `useController` so callers don't need two `<Controller>` wrappers.
 *
 * State first, then City: picking a state narrows the ~5,800-entry `typed-usa-states` city list
 * to that state, which is the direction the client asked for ("the states don't update
 * according to the state selected" — the previous city-first layout derived state *from* city
 * and never filtered city by state at all). City still accepts any typed value
 * (`allowCustomValue`), since even the full list isn't every incorporated place, and still
 * auto-fills the state when a typed city has exactly one unambiguous match, for the case where
 * someone types a city before picking a state. */
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

  const cityOptions = state ? (CITY_OPTIONS_BY_STATE.get(state) ?? []) : ALL_CITY_OPTIONS

  function handleCityChange(nextCity: string) {
    cityField.field.onChange(nextCity)
    if (state) return // already scoped, nothing to infer
    const normalized = nextCity.trim().toLowerCase()
    const matches = US_CITIES.filter((c) => c.city.toLowerCase() === normalized)
    if (matches.length === 1) {
      stateField.field.onChange(matches[0].state)
    }
  }

  return (
    <FormGrid>
      <FormField label="State" htmlFor={`${idPrefix}-state`} error={stateField.fieldState.error?.message}>
        <Combobox
          id={`${idPrefix}-state`}
          value={state}
          onValueChange={stateField.field.onChange}
          options={STATE_OPTIONS}
          placeholder="Select a state"
          searchPlaceholder="Search states..."
          aria-invalid={!!stateField.fieldState.error}
        />
      </FormField>
      <FormField label="City" htmlFor={`${idPrefix}-city`} error={cityField.fieldState.error?.message}>
        <Combobox
          id={`${idPrefix}-city`}
          value={city}
          onValueChange={handleCityChange}
          options={cityOptions}
          placeholder={state ? "Select or type a city" : "Select a state first"}
          searchPlaceholder="Type a city..."
          allowCustomValue
          aria-invalid={!!cityField.fieldState.error}
        />
      </FormField>
    </FormGrid>
  )
}
