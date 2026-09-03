"use client"

import * as React from "react"
import { ClockIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { ClockDial } from "@/components/ui/clock-dial"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  TimeField,
  timeDigitsToValue,
  valueToTimeDigits,
  type Period,
} from "@/components/ui/time-field"

/** A time you can type or dial.
 *
 * `value`/`onChange` keep the 24-hour "HH:mm" shape a native `<input type="time">` uses, so
 * this remains a drop-in for `DateTimePicker` and, through it, the promotion and announcement
 * forms. The clock toggle sits inside the field rather than beside it, matching DatePicker. */
export function TimePicker({
  id,
  value,
  onChange,
  disabled,
  required,
  className,
  minuteStep = 1,
  "aria-label": ariaLabel = "Time",
  "aria-invalid": ariaInvalid,
}: {
  id?: string
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  required?: boolean
  className?: string
  /** Snap interval for the dial's minute hand. Typing is always free-form. */
  minuteStep?: number
  "aria-label"?: string
  "aria-invalid"?: boolean
}) {
  const [open, setOpen] = React.useState(false)
  const [draft, setDraft] = React.useState(() => valueToTimeDigits(value))

  // Keep the typed buffer in sync when `value` changes from outside without clobbering a
  // partially typed time. Adjusted during render per React's derived-state pattern.
  const [prevValue, setPrevValue] = React.useState(value)
  if (value !== prevValue) {
    setPrevValue(value)
    setDraft(valueToTimeDigits(value))
  }

  function handleFieldChange(next: { digits: string; period: Period | null }) {
    setDraft(next)
    const parsed = timeDigitsToValue(next.digits, next.period)
    if (parsed) onChange(parsed)
    else if (next.digits.length === 0) onChange("")
  }

  // The dial always needs concrete hands, so it falls back to 12:00 AM when nothing is set.
  const parsed = valueToTimeDigits(value)
  const hour12 = parsed.digits ? Number(parsed.digits.slice(0, 2)) : 12
  const minute = parsed.digits ? Number(parsed.digits.slice(2, 4)) : 0
  const period: Period = parsed.period ?? "AM"

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <TimeField
        id={id}
        digits={draft.digits}
        period={draft.period}
        onChange={handleFieldChange}
        disabled={disabled}
        required={required}
        aria-label={ariaLabel}
        aria-invalid={ariaInvalid}
        className={className}
        trailing={
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={disabled}
              aria-label="Open clock"
              className="size-8 shrink-0 text-muted-foreground hover:text-foreground"
            >
              <ClockIcon className="size-4" />
            </Button>
          </PopoverTrigger>
        }
      />
      <PopoverContent className={cn("w-auto p-4")} align="start">
        <ClockDial
          hour12={hour12}
          minute={minute}
          period={period}
          minuteStep={minuteStep}
          onChange={(next) => {
            const hour24 =
              next.period === "AM" ? next.hour12 % 12 : (next.hour12 % 12) + 12
            onChange(
              `${String(hour24).padStart(2, "0")}:${String(next.minute).padStart(2, "0")}`,
            )
          }}
        />
        <div className="mt-3 flex justify-end">
          <Button type="button" size="sm" onClick={() => setOpen(false)}>
            Done
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
