"use client"

import * as React from "react"
import { CalendarIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { formatDateValue, parseDateValue } from "@/lib/format-date"

const DISPLAY_FORMAT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
})

/** A calendar-popover date picker. `value`/`onChange` use the same "yyyy-MM-dd" string
 * shape as a native `<input type="date">`, so it drops in as a direct replacement. */
export function DatePicker({
  id,
  value,
  onChange,
  placeholder = "Pick a date",
  className,
  disabled,
}: {
  id?: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  disabled?: boolean
}) {
  const [open, setOpen] = React.useState(false)
  const selected = parseDateValue(value)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn(
            "w-40 justify-start gap-2 font-normal",
            !selected && "text-muted-foreground",
            className,
          )}
        >
          <CalendarIcon className="size-4" />
          {selected ? DISPLAY_FORMAT.format(selected) : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={(date) => {
            onChange(date ? formatDateValue(date) : "")
            setOpen(false)
          }}
          autoFocus
        />
      </PopoverContent>
    </Popover>
  )
}
