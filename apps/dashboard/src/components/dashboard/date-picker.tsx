"use client"

import * as React from "react"
import { CalendarIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar, DEFAULT_RANGE_PRESETS, type DateRange } from "@/components/ui/calendar"
import { DateField, digitsFromDate, digitsOf, parseDigits } from "@/components/ui/date-field"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { formatDateValue, parseDateValue } from "@/lib/format-date"

/** The calendar toggle, rendered inside the field rather than as a separate button beside it.
 * A date and its picker used to read as two unrelated controls, which on the promotion form
 * meant Starts and Ends together were eight boxes in a row. */
function CalendarToggle({ disabled, label }: { disabled?: boolean; label: string }) {
  return (
    <PopoverTrigger asChild>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        disabled={disabled}
        aria-label={label}
        className="size-8 shrink-0 text-muted-foreground hover:text-foreground"
      >
        <CalendarIcon className="size-4" />
      </Button>
    </PopoverTrigger>
  )
}

/** A single date. `value`/`onChange` keep the "yyyy-MM-dd" string shape a native
 * `<input type="date">` uses, so this stays a drop-in for every existing call site. */
export function DatePicker({
  id,
  value,
  onChange,
  placeholder = "MM/DD/YYYY",
  className,
  disabled,
  required,
  minDate,
  maxDate,
  "aria-invalid": ariaInvalid,
  "aria-label": ariaLabel,
}: {
  id?: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  disabled?: boolean
  required?: boolean
  minDate?: Date
  maxDate?: Date
  "aria-invalid"?: boolean
  "aria-label"?: string
}) {
  const [open, setOpen] = React.useState(false)
  const selected = parseDateValue(value)
  const [digits, setDigits] = React.useState(() => (selected ? digitsFromDate(selected) : ""))

  // Keep the typed buffer in sync when `value` changes from outside (a parent reset, or the
  // other half of a date range) without clobbering a partially typed date. Adjusted during
  // render per React's documented derived-state pattern rather than in an effect.
  const [prevValue, setPrevValue] = React.useState(value)
  if (value !== prevValue) {
    setPrevValue(value)
    setDigits(selected ? digitsFromDate(selected) : "")
  }

  function commit(date: Date | undefined) {
    onChange(date ? formatDateValue(date) : "")
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <DateField
        id={id}
        value={digits}
        onChange={setDigits}
        onCommit={commit}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
        aria-invalid={ariaInvalid}
        aria-label={ariaLabel}
        className={cn("w-44", className)}
        trailing={<CalendarToggle disabled={disabled} label="Open calendar" />}
      />
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected}
          minDate={minDate}
          maxDate={maxDate}
          autoFocus
          onSelect={(date) => {
            commit(date)
            setDigits(date ? digitsFromDate(date) : "")
            setOpen(false)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}

/** A start and end date in one control. Replaces the two independent single pickers that the
 * commissions filter and the chart's Custom range were using, which could not express "these
 * two dates are one range" and made drag-selecting impossible. */
export function DateRangePicker({
  id,
  value,
  onChange,
  className,
  disabled,
  minDate,
  maxDate,
  "aria-invalid": ariaInvalid,
}: {
  id?: string
  /** `{ from, to }` as "yyyy-MM-dd" strings. Either may be empty. */
  value: { from: string; to: string }
  onChange: (value: { from: string; to: string }) => void
  className?: string
  disabled?: boolean
  minDate?: Date
  maxDate?: Date
  "aria-invalid"?: boolean
}) {
  const [open, setOpen] = React.useState(false)
  const from = parseDateValue(value.from)
  const to = parseDateValue(value.to)
  const range: DateRange = from && to ? { from, to } : null

  const [fromDigits, setFromDigits] = React.useState(() => (from ? digitsFromDate(from) : ""))
  const [toDigits, setToDigits] = React.useState(() => (to ? digitsFromDate(to) : ""))

  const key = `${value.from}|${value.to}`
  const [prevKey, setPrevKey] = React.useState(key)
  if (key !== prevKey) {
    setPrevKey(key)
    setFromDigits(from ? digitsFromDate(from) : "")
    setToDigits(to ? digitsFromDate(to) : "")
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div className={cn("flex items-center gap-1.5", className)}>
        <DateField
          id={id}
          value={fromDigits}
          onChange={setFromDigits}
          onCommit={(date) => onChange({ ...value, from: date ? formatDateValue(date) : "" })}
          aria-label="From"
          aria-invalid={ariaInvalid}
          disabled={disabled}
          className="w-40"
        />
        <span className="text-meta text-muted-foreground">to</span>
        <DateField
          value={toDigits}
          onChange={setToDigits}
          onCommit={(date) => onChange({ ...value, to: date ? formatDateValue(date) : "" })}
          aria-label="To"
          aria-invalid={ariaInvalid}
          disabled={disabled}
          className="w-40"
          trailing={<CalendarToggle disabled={disabled} label="Open calendar" />}
        />
      </div>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="range"
          selected={range}
          defaultMonth={from}
          minDate={minDate}
          maxDate={maxDate}
          presets={DEFAULT_RANGE_PRESETS}
          autoFocus
          onSelect={(next) =>
            onChange({
              from: next ? formatDateValue(next.from) : "",
              to: next ? formatDateValue(next.to) : "",
            })
          }
        />
      </PopoverContent>
    </Popover>
  )
}

export { digitsOf, parseDigits }
