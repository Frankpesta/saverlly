"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { DatePicker } from "@/components/dashboard/date-picker"
import { TimePicker } from "@/components/dashboard/time-picker"
import { formatDatetimeLocalValue, parseDatetimeLocalValue, formatDateValue, parseDateValue } from "@/lib/format-date"

/** A date + time picker, stacked vertically. Both the date and time fields support typing
 * directly or picking from a popover. `value`/`onChange` use the same "yyyy-MM-ddTHH:mm" string
 * shape as a native `<input type="datetime-local">`, so it drops in as a direct replacement. */
export function DateTimePicker({
  id,
  value,
  onChange,
  placeholder = "Pick a date",
  className,
  disabled,
  required,
  "aria-invalid": ariaInvalid,
}: {
  id?: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  disabled?: boolean
  required?: boolean
  "aria-invalid"?: boolean
}) {
  const selected = parseDatetimeLocalValue(value)
  const dateValue = selected ? formatDateValue(selected) : ""
  const timeValue = selected ? formatDatetimeLocalValue(selected).slice(11) : ""

  function handleDateChange(nextDateValue: string) {
    const nextDate = parseDateValue(nextDateValue)
    if (!nextDate) {
      onChange("")
      return
    }
    nextDate.setHours(selected?.getHours() ?? 0, selected?.getMinutes() ?? 0)
    onChange(formatDatetimeLocalValue(nextDate))
  }

  function handleTimeChange(next: string) {
    const [hours, minutes] = next.split(":").map(Number)
    const base = selected ? new Date(selected) : new Date()
    base.setHours(hours || 0, minutes || 0)
    onChange(formatDatetimeLocalValue(base))
  }

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <DatePicker
        id={id}
        value={dateValue}
        onChange={handleDateChange}
        placeholder={placeholder}
        disabled={disabled}
        aria-invalid={ariaInvalid}
      />
      <TimePicker
        value={timeValue}
        onChange={handleTimeChange}
        disabled={disabled || !selected}
        required={required}
        aria-invalid={ariaInvalid}
      />
    </div>
  )
}
