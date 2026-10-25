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

const CITY_OPTIONS_BY_STATE = new Map<string, { value: string; label: string }[]>()
for (const [code, group] of Map.groupBy(US_CITIES, (c) => c.state)) {
  CITY_OPTIONS_BY_STATE.set(
    code,
    Array.from(new Set(group.map((c) => c.city)))
      .sort()
      .map((city) => ({ value: city, label: city })),
  )
}

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
 * Rendered State-first, City-second per the client's layout preference. Only City is ever
 * narrowed: a chosen State limits City to that state's cities, and switching State clears a
 * city that doesn't exist there. State always offers every state, so a choice can always be
 * changed in either field without first undoing the other. (Narrowing both ways used to
 * deadlock: Austin, TX limited State to Austin's states while TX limited City to Texas.)
 * Picking a City first still helps: it auto-fills State when the city exists in exactly one,
 * and otherwise lists its states first (a name like "Springfield" spans dozens). City still
 * accepts a typed value that isn't listed (`allowCustomValue`), since even ~29,500 cities isn't
 * every unincorporated place. */
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
  const stateOptions = stateOptionsForCity
    ? [
        ...stateOptionsForCity,
        ...ALL_STATE_OPTIONS.filter((option) => !stateOptionsForCity.includes(option)),
      ]
    : ALL_STATE_OPTIONS
  const cityOptions = (state && CITY_OPTIONS_BY_STATE.get(state)) || ALL_CITY_OPTIONS

  function handleStateChange(nextState: string) {
    stateField.field.onChange(nextState)
    // Only a listed city that doesn't exist in the new state is cleared. A typed, unlisted city
    // has no known state, so it's left for the user to judge.
    const statesForCity = STATE_OPTIONS_BY_CITY.get(city.trim().toLowerCase())
    if (statesForCity && !statesForCity.some((option) => option.value === nextState)) {
      cityField.field.onChange("")
    }
  }

  function handleCityChange(nextCity: string) {
    cityField.field.onChange(nextCity)
    const matches = STATE_OPTIONS_BY_CITY.get(nextCity.trim().toLowerCase())
    // A city that exists in exactly one state settles State, including correcting it when a
    // typed city (e.g. "Los Angeles" while Texas is chosen) belongs somewhere else.
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
          onValueChange={handleStateChange}
          options={stateOptions}
          placeholder={stateOptionsForCity && !state ? "Select the matching state" : "Select a state"}
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
          placeholder="Select or type a city"
          searchPlaceholder="Type a city..."
          allowCustomValue
          aria-invalid={!!cityField.fieldState.error}
        />
      </FormField>
    </FormGrid>
  )
}
