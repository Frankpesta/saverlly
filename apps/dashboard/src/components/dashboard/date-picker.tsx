"use client"

import * as React from "react"
import { CalendarIcon } from "lucide-react"
import { parse, isValid } from "date-fns"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { formatDateValue, parseDateValue } from "@/lib/format-date"

const DISPLAY_FORMAT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
})

// Typed input accepts any of these — first one that produces a valid date wins.
const TYPE_FORMATS = ["M/d/yyyy", "MM/dd/yyyy", "yyyy-MM-dd", "MMM d, yyyy", "MMMM d, yyyy"]

/** Parses free-typed text (several common shapes) into a Date, or undefined if none match. */
function parseTypedDate(text: string): Date | undefined {
  const trimmed = text.trim()
  if (!trimmed) return undefined
  for (const fmt of TYPE_FORMATS) {
    const parsed = parse(trimmed, fmt, new Date())
    if (isValid(parsed)) return parsed
  }
  return undefined
}

/** A date picker that supports both typing a date directly and selecting one from a popover
 * calendar. `value`/`onChange` use the same "yyyy-MM-dd" string shape as a native
 * `<input type="date">`, so it drops in as a direct replacement. */
export function DatePicker({
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
  const [open, setOpen] = React.useState(false)
  const selected = parseDateValue(value)
  const [text, setText] = React.useState(selected ? DISPLAY_FORMAT.format(selected) : "")

  // Keep the typed text in sync when `value` changes from outside (e.g. a calendar select
  // elsewhere, or the parent resetting the form) without clobbering what's being typed —
  // adjusted during render rather than in an effect, per React's documented pattern for
  // deriving state from a changed prop.
  const [prevValue, setPrevValue] = React.useState(value)
  if (value !== prevValue) {
    setPrevValue(value)
    setText(selected ? DISPLAY_FORMAT.format(selected) : "")
  }

  function commitTyped(raw: string) {
    const parsed = parseTypedDate(raw)
    if (parsed) {
      onChange(formatDateValue(parsed))
      setText(DISPLAY_FORMAT.format(parsed))
    } else if (!raw.trim()) {
      onChange("")
    } else {
      // Invalid text — revert to the last known-good value rather than keeping garbage.
      setText(selected ? DISPLAY_FORMAT.format(selected) : "")
    }
  }

  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <Input
        id={id}
        type="text"
        inputMode="numeric"
        placeholder={placeholder}
        value={text}
        disabled={disabled}
        required={required}
        aria-invalid={ariaInvalid}
        onChange={(e) => setText(e.target.value)}
        onBlur={(e) => commitTyped(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault()
            commitTyped(e.currentTarget.value)
          }
        }}
        className="w-40"
      />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="icon"
            disabled={disabled}
            aria-label="Open calendar"
            className="shrink-0"
          >
            <CalendarIcon className="size-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={selected}
            defaultMonth={selected}
            onSelect={(date) => {
              onChange(date ? formatDateValue(date) : "")
              setText(date ? DISPLAY_FORMAT.format(date) : "")
              setOpen(false)
            }}
            autoFocus
          />
        </PopoverContent>
      </Popover>
    </div>
  )
}
