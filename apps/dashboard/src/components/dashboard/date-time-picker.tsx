"use client"

import * as React from "react"
import { CalendarIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { formatDatetimeLocalValue, parseDatetimeLocalValue } from "@/lib/format-date"

const DISPLAY_FORMAT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
})

/** A calendar-popover date picker paired with a time field. `value`/`onChange` use the same
 * "yyyy-MM-ddTHH:mm" string shape as a native `<input type="datetime-local">`, so it drops
 * in as a direct replacement. */
export function DateTimePicker({
  id,
  value,
  onChange,
  placeholder = "Pick a date",
  className,
  disabled,
  required,
}: {
  id?: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  disabled?: boolean
  required?: boolean
}) {
  const [open, setOpen] = React.useState(false)
  const selected = parseDatetimeLocalValue(value)
  const timeValue = selected ? formatDatetimeLocalValue(selected).slice(11) : ""

  function handleDateSelect(date: Date | undefined) {
    if (!date) return
    const next = new Date(date)
    next.setHours(selected?.getHours() ?? 0, selected?.getMinutes() ?? 0)
    onChange(formatDatetimeLocalValue(next))
    setOpen(false)
  }

  function handleTimeChange(next: string) {
    const [hours, minutes] = next.split(":").map(Number)
    const base = selected ? new Date(selected) : new Date()
    base.setHours(hours, minutes)
    onChange(formatDatetimeLocalValue(base))
  }

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            disabled={disabled}
            className={cn(
              "w-full justify-start gap-2 font-normal",
              !selected && "text-muted-foreground",
            )}
          >
            <CalendarIcon className="size-4" />
            {selected ? DISPLAY_FORMAT.format(selected) : placeholder}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar mode="single" selected={selected} onSelect={handleDateSelect} autoFocus />
        </PopoverContent>
      </Popover>
      <Input
        type="time"
        aria-label="Time"
        value={timeValue}
        onChange={(e) => handleTimeChange(e.target.value)}
        disabled={disabled || !selected}
        required={required}
        className="w-full"
      />
    </div>
  )
}
