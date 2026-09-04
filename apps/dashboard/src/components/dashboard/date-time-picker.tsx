"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { DatePicker, DateRangePicker } from "@/components/dashboard/date-picker"
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

/** A start and end datetime, as one drag-selectable calendar for the dates plus two small time
 * fields for the time of day on each end. Replaces a pair of independent `DateTimePicker`s (two
 * full date+time stacks, four boxes total) with a single range control that expresses "these two
 * dates are one span" the way `DateRangePicker` already does for date-only ranges, while keeping
 * per-end time precision that a pure date range can't carry.
 *
 * `start`/`end` use the same "yyyy-MM-ddTHH:mm" shape `DateTimePicker` does. Picking a new date
 * range preserves whatever time of day was already set on each end (dragging is almost always
 * about the dates, not a reason to reset a time someone already chose); a range picked from
 * scratch defaults to the start of day for `start` and the end of day for `end`, so a fresh
 * selection reads as "runs all day" rather than a random instant. */
export function DateTimeRangePicker({
  id,
  start,
  end,
  onChange,
  disabled,
  minDate,
  className,
  "aria-invalid": ariaInvalid,
}: {
  id?: string
  start: string
  end: string
  onChange: (next: { start: string; end: string }) => void
  disabled?: boolean
  minDate?: Date
  className?: string
  "aria-invalid"?: boolean
}) {
  const startDate = parseDatetimeLocalValue(start)
  const endDate = parseDatetimeLocalValue(end)

  const range = {
    from: startDate ? formatDateValue(startDate) : "",
    to: endDate ? formatDateValue(endDate) : "",
  }
  const startTime = startDate ? formatDatetimeLocalValue(startDate).slice(11) : ""
  const endTime = endDate ? formatDatetimeLocalValue(endDate).slice(11) : ""

  function withTime(date: Date, hours: number, minutes: number): Date {
    const next = new Date(date)
    next.setHours(hours, minutes)
    return next
  }

  function handleRangeChange(next: { from: string; to: string }) {
    const nextFrom = parseDateValue(next.from)
    const nextTo = parseDateValue(next.to)
    onChange({
      start: nextFrom
        ? formatDatetimeLocalValue(withTime(nextFrom, startDate?.getHours() ?? 0, startDate?.getMinutes() ?? 0))
        : "",
      end: nextTo
        ? formatDatetimeLocalValue(withTime(nextTo, endDate?.getHours() ?? 23, endDate?.getMinutes() ?? 59))
        : "",
    })
  }

  function handleStartTimeChange(next: string) {
    const [hours, minutes] = next.split(":").map(Number)
    const base = startDate ?? new Date()
    onChange({ start: formatDatetimeLocalValue(withTime(base, hours || 0, minutes || 0)), end })
  }

  function handleEndTimeChange(next: string) {
    const [hours, minutes] = next.split(":").map(Number)
    const base = endDate ?? new Date()
    onChange({ start, end: formatDatetimeLocalValue(withTime(base, hours || 0, minutes || 0)) })
  }

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <DateRangePicker
        id={id}
        value={range}
        onChange={handleRangeChange}
        disabled={disabled}
        minDate={minDate}
        aria-invalid={ariaInvalid}
      />
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-muted-foreground">Start time</span>
          <TimePicker
            value={startTime}
            onChange={handleStartTimeChange}
            disabled={disabled || !startDate}
            aria-label="Start time"
            aria-invalid={ariaInvalid}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-muted-foreground">End time</span>
          <TimePicker
            value={endTime}
            onChange={handleEndTimeChange}
            disabled={disabled || !endDate}
            aria-label="End time"
            aria-invalid={ariaInvalid}
          />
        </div>
      </div>
    </div>
  )
}
