"use client"

import * as React from "react"
import { Input } from "@/components/ui/input"
import { roundToNearest5 } from "@/lib/dashboard/round-to-5"

/** A revenue-share percentage input. Snaps to the nearest multiple of 5 on blur (the real
 * enforcement is the `revenueShareSchema` zod rule, this is just a typing convenience so a
 * user doesn't have to land on a multiple of 5 by hand). Kept as a real numeric field for
 * react-hook-form (not a string) while still letting the input sit empty mid-edit. */
export function RevenueShareInput({
  id,
  value,
  onChange,
  onBlur,
  "aria-invalid": ariaInvalid,
}: {
  id?: string
  value: number
  onChange: (value: number) => void
  onBlur: () => void
  "aria-invalid"?: boolean
}) {
  const [draft, setDraft] = React.useState(String(value))

  // Adjusted during render rather than in an effect, per React's documented pattern for
  // deriving state from a changed prop (avoids the cascading-render lint error an effect trips).
  const [prevValue, setPrevValue] = React.useState(value)
  if (value !== prevValue) {
    setPrevValue(value)
    setDraft(String(value))
  }

  return (
    <Input
      id={id}
      type="number"
      min="0"
      max="100"
      step="5"
      aria-invalid={ariaInvalid}
      value={draft}
      onChange={(e) => {
        setDraft(e.target.value)
        const parsed = Number(e.target.value)
        if (e.target.value !== "" && !Number.isNaN(parsed)) onChange(parsed)
      }}
      onBlur={() => {
        if (draft !== "") onChange(roundToNearest5(Number(draft)))
        onBlur()
      }}
    />
  )
}
