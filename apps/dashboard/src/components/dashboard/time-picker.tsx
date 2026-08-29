"use client"

import * as React from "react"
import { ClockIcon } from "lucide-react"
import { parse, isValid, format } from "date-fns"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

const TYPE_FORMATS = ["h:mm a", "h:mma", "H:mm", "HH:mm", "h a", "ha"]

const HOURS = Array.from({ length: 12 }, (_, i) => i + 1)
const MINUTES = [0, 15, 30, 45]

/** Parses a 24h "HH:mm" value into hour/minute/period parts for the picker list, or nulls if empty. */
function partsFromValue(value: string): { hour12: number; minute: number; period: "AM" | "PM" } | null {
  if (!/^\d{2}:\d{2}$/.test(value)) return null
  const [h, m] = value.split(":").map(Number)
  const period: "AM" | "PM" = h >= 12 ? "PM" : "AM"
  const hour12 = h % 12 === 0 ? 12 : h % 12
  return { hour12, minute: m, period }
}

function toValue(hour12: number, minute: number, period: "AM" | "PM"): string {
  const hour24 = period === "AM" ? (hour12 % 12) : (hour12 % 12) + 12
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${pad(hour24)}:${pad(minute)}`
}

function displayText(value: string): string {
  const parts = partsFromValue(value)
  if (!parts) return ""
  return `${parts.hour12}:${String(parts.minute).padStart(2, "0")} ${parts.period}`
}

function parseTypedTime(text: string): string | undefined {
  const trimmed = text.trim()
  if (!trimmed) return undefined
  for (const fmt of TYPE_FORMATS) {
    const parsed = parse(trimmed, fmt, new Date())
    if (isValid(parsed)) return format(parsed, "HH:mm")
  }
  return undefined
}

/** A time picker supporting both typing a time directly ("3:30 PM", "15:30", …) and picking one
 * from a popover list. `value`/`onChange` use the same 24h "HH:mm" string shape as a native
 * `<input type="time">`, so it drops in as a direct replacement. */
export function TimePicker({
  value,
  onChange,
  disabled,
  required,
  className,
  "aria-label": ariaLabel = "Time",
  "aria-invalid": ariaInvalid,
}: {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  required?: boolean
  className?: string
  "aria-label"?: string
  "aria-invalid"?: boolean
}) {
  const [open, setOpen] = React.useState(false)
  const [text, setText] = React.useState(displayText(value))

  // Adjusted during render rather than in an effect, per React's documented pattern for
  // deriving state from a changed prop (avoids the cascading-render lint error an effect trips).
  const [prevValue, setPrevValue] = React.useState(value)
  if (value !== prevValue) {
    setPrevValue(value)
    setText(displayText(value))
  }

  function commitTyped(raw: string) {
    const parsed = parseTypedTime(raw)
    if (parsed) {
      onChange(parsed)
      setText(displayText(parsed))
    } else if (!raw.trim()) {
      onChange("")
      setText("")
    } else {
      setText(displayText(value))
    }
  }

  const parts = partsFromValue(value)

  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <Input
        type="text"
        aria-label={ariaLabel}
        placeholder="h:mm AM/PM"
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
        className="w-full"
      />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="icon"
            disabled={disabled}
            aria-label="Open time picker"
            className="shrink-0"
          >
            <ClockIcon className="size-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-2" align="start">
          <div className="flex gap-1">
            <div className="flex max-h-48 flex-col gap-0.5 overflow-y-auto pr-1">
              {HOURS.map((h) => (
                <Button
                  key={h}
                  type="button"
                  size="sm"
                  variant={parts?.hour12 === h ? "default" : "ghost"}
                  className="justify-center px-3"
                  onClick={() => onChange(toValue(h, parts?.minute ?? 0, parts?.period ?? "AM"))}
                >
                  {h}
                </Button>
              ))}
            </div>
            <div className="flex max-h-48 flex-col gap-0.5 overflow-y-auto pr-1">
              {MINUTES.map((m) => (
                <Button
                  key={m}
                  type="button"
                  size="sm"
                  variant={parts?.minute === m ? "default" : "ghost"}
                  className="justify-center px-3"
                  onClick={() => onChange(toValue(parts?.hour12 ?? 12, m, parts?.period ?? "AM"))}
                >
                  {String(m).padStart(2, "0")}
                </Button>
              ))}
            </div>
            <div className="flex flex-col gap-0.5">
              {(["AM", "PM"] as const).map((p) => (
                <Button
                  key={p}
                  type="button"
                  size="sm"
                  variant={parts?.period === p ? "default" : "ghost"}
                  className="justify-center px-3"
                  onClick={() => onChange(toValue(parts?.hour12 ?? 12, parts?.minute ?? 0, p))}
                >
                  {p}
                </Button>
              ))}
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
