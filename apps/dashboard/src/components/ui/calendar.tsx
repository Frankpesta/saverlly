"use client"

import * as React from "react"
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

/* Hand-built rather than react-day-picker. The stock shadcn calendar needed a wall of class
 * overrides to look like anything but shadcn, its cells were 28px (cramped), and it has no
 * drag-to-select. Building it here follows the same no-new-dependency route already taken for
 * gauge.tsx and meter.tsx, and means the design system applies by construction instead of by
 * override. date-fns is already a dependency but the arithmetic below is small enough to do
 * directly, which keeps the month grid free of timezone-sensitive helpers. */

export type DateRange = { from: Date; to: Date } | null

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"]
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]

/** Midnight local, so every comparison in this file is a pure calendar-day comparison and
 * never depends on the time component of whatever the caller passed in. */
function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function isSameDay(a: Date | undefined, b: Date | undefined): boolean {
  if (!a || !b) return false
  return (
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  )
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function addMonths(date: Date, months: number): Date {
  // Clamp to the last day of the target month so 31 Jan + 1 month lands on 28/29 Feb rather
  // than rolling forward into March, which is what a naive setMonth does.
  const target = new Date(date.getFullYear(), date.getMonth() + months, 1)
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate()
  target.setDate(Math.min(date.getDate(), lastDay))
  return target
}

/** Always six rows of seven. A fixed grid keeps the popover from resizing as you page through
 * months, which is otherwise a visible jump between a 5-row and 6-row month. */
function buildMonthGrid(month: Date): Date[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1)
  const start = addDays(first, -first.getDay())
  return Array.from({ length: 42 }, (_, i) => addDays(start, i))
}

function clampToRange(date: Date, min?: Date, max?: Date): boolean {
  if (min && date < startOfDay(min)) return false
  if (max && date > startOfDay(max)) return false
  return true
}

function orderRange(a: Date, b: Date): { from: Date; to: Date } {
  return a <= b ? { from: a, to: b } : { from: b, to: a }
}

type CommonProps = {
  className?: string
  /** Month to display initially. Falls back to the selection, then today. */
  defaultMonth?: Date
  minDate?: Date
  maxDate?: Date
  isDateDisabled?: (date: Date) => boolean
  autoFocus?: boolean
}

type SingleProps = CommonProps & {
  mode?: "single"
  selected?: Date
  onSelect?: (date: Date | undefined) => void
}

type RangeProps = CommonProps & {
  mode: "range"
  selected?: DateRange
  onSelect?: (range: DateRange) => void
  /** Quick-pick rail down the left side. Range mode only. */
  presets?: { label: string; range: () => { from: Date; to: Date } }[]
}

export type CalendarProps = SingleProps | RangeProps

export const DEFAULT_RANGE_PRESETS: NonNullable<RangeProps["presets"]> = [
  { label: "Today", range: () => ({ from: startOfDay(new Date()), to: startOfDay(new Date()) }) },
  { label: "Last 7 days", range: () => ({ from: addDays(startOfDay(new Date()), -6), to: startOfDay(new Date()) }) },
  { label: "Last 30 days", range: () => ({ from: addDays(startOfDay(new Date()), -29), to: startOfDay(new Date()) }) },
  {
    label: "This month",
    range: () => {
      const now = new Date()
      return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: startOfDay(now) }
    },
  },
  {
    label: "Last month",
    range: () => {
      const now = new Date()
      return {
        from: new Date(now.getFullYear(), now.getMonth() - 1, 1),
        to: new Date(now.getFullYear(), now.getMonth(), 0),
      }
    },
  },
]

export function Calendar(props: CalendarProps) {
  const { className, defaultMonth, minDate, maxDate, isDateDisabled, autoFocus } = props
  const isRange = props.mode === "range"

  const selectedSingle = !isRange ? (props as SingleProps).selected : undefined
  const selectedRange = isRange ? ((props as RangeProps).selected ?? null) : null

  const initialMonth =
    defaultMonth ?? selectedSingle ?? selectedRange?.from ?? new Date()
  const [month, setMonth] = React.useState(
    () => new Date(initialMonth.getFullYear(), initialMonth.getMonth(), 1),
  )
  const [focusedDate, setFocusedDate] = React.useState<Date>(() => startOfDay(initialMonth))

  /** While a drag is in progress this holds the anchor day; the provisional range is anchor to
   * hovered, and only becomes the real selection on pointerup. */
  const [dragAnchor, setDragAnchor] = React.useState<Date | null>(null)
  const [hoverDate, setHoverDate] = React.useState<Date | null>(null)

  const gridRef = React.useRef<HTMLDivElement>(null)
  const days = React.useMemo(() => buildMonthGrid(month), [month])
  const today = startOfDay(new Date())

  const isDisabled = React.useCallback(
    (date: Date) => !clampToRange(date, minDate, maxDate) || Boolean(isDateDisabled?.(date)),
    [minDate, maxDate, isDateDisabled],
  )

  // A drag can end anywhere on the page, including outside the popover, so the release has to
  // be caught on the window rather than on the day cell that started it.
  React.useEffect(() => {
    if (!dragAnchor) return
    function finish() {
      setDragAnchor(null)
      setHoverDate(null)
    }
    window.addEventListener("pointerup", finish)
    window.addEventListener("pointercancel", finish)
    return () => {
      window.removeEventListener("pointerup", finish)
      window.removeEventListener("pointercancel", finish)
    }
  }, [dragAnchor])

  const provisional: { from: Date; to: Date } | null =
    dragAnchor && hoverDate ? orderRange(dragAnchor, hoverDate) : null
  const shownRange = provisional ?? selectedRange

  function commitRange(next: { from: Date; to: Date } | null) {
    ;(props as RangeProps).onSelect?.(next)
  }

  function handleDayPointerDown(date: Date) {
    if (isDisabled(date)) return
    setFocusedDate(date)
    if (!isRange) {
      ;(props as SingleProps).onSelect?.(date)
      return
    }
    setDragAnchor(date)
    setHoverDate(date)
    // A plain click without any drag is still a valid one-day range; pointerup keeps it.
    commitRange({ from: date, to: date })
  }

  function handleDayPointerEnter(date: Date) {
    if (!isRange || !dragAnchor || isDisabled(date)) return
    setHoverDate(date)
    commitRange(orderRange(dragAnchor, date))
  }

  function handleDayClick(date: Date, event: React.MouseEvent) {
    if (!isRange || isDisabled(date)) return
    // Shift-click extends from the existing start rather than beginning a new range, the
    // same convention as a file list.
    if (event.shiftKey && selectedRange) {
      commitRange(orderRange(selectedRange.from, date))
    }
  }

  function moveFocus(deltaDays: number) {
    const next = addDays(focusedDate, deltaDays)
    setFocusedDate(next)
    if (next.getMonth() !== month.getMonth() || next.getFullYear() !== month.getFullYear()) {
      setMonth(new Date(next.getFullYear(), next.getMonth(), 1))
    }
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    switch (event.key) {
      case "ArrowLeft": event.preventDefault(); moveFocus(-1); break
      case "ArrowRight": event.preventDefault(); moveFocus(1); break
      case "ArrowUp": event.preventDefault(); moveFocus(-7); break
      case "ArrowDown": event.preventDefault(); moveFocus(7); break
      case "Home": event.preventDefault(); moveFocus(-focusedDate.getDay()); break
      case "End": event.preventDefault(); moveFocus(6 - focusedDate.getDay()); break
      case "PageUp": event.preventDefault(); setFocusedDate(addMonths(focusedDate, -1)); setMonth(addMonths(month, -1)); break
      case "PageDown": event.preventDefault(); setFocusedDate(addMonths(focusedDate, 1)); setMonth(addMonths(month, 1)); break
      case "Escape":
        if (dragAnchor) { event.preventDefault(); setDragAnchor(null); setHoverDate(null) }
        break
      case "Enter":
      case " ":
        event.preventDefault()
        handleDayPointerDown(focusedDate)
        break
    }
  }

  const yearOptions = React.useMemo(() => {
    const centre = month.getFullYear()
    const lo = minDate ? minDate.getFullYear() : centre - 10
    const hi = maxDate ? maxDate.getFullYear() : centre + 10
    return Array.from({ length: Math.max(1, hi - lo + 1) }, (_, i) => lo + i)
  }, [month, minDate, maxDate])

  return (
    <div
      className={cn("flex gap-3 p-3", className)}
      onPointerLeave={() => { if (!dragAnchor) setHoverDate(null) }}
    >
      {isRange && (props as RangeProps).presets && (
        <div className="flex w-32 shrink-0 flex-col gap-0.5 border-r border-border pr-3">
          {(props as RangeProps).presets!.map((preset) => (
            <Button
              key={preset.label}
              type="button"
              variant="ghost"
              size="sm"
              className="justify-start font-normal"
              onClick={() => {
                const next = preset.range()
                commitRange(next)
                setMonth(new Date(next.from.getFullYear(), next.from.getMonth(), 1))
              }}
            >
              {preset.label}
            </Button>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Previous month"
            disabled={Boolean(minDate) && addMonths(month, -1) < new Date(minDate!.getFullYear(), minDate!.getMonth(), 1)}
            onClick={() => setMonth(addMonths(month, -1))}
          >
            <ChevronLeftIcon className="size-4" />
          </Button>

          <div className="flex items-center gap-1">
            <select
              aria-label="Month"
              className="rounded-md bg-transparent px-1.5 py-1 text-label font-medium outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50"
              value={month.getMonth()}
              onChange={(e) => setMonth(new Date(month.getFullYear(), Number(e.target.value), 1))}
            >
              {MONTHS.map((name, index) => (
                <option key={name} value={index}>{name}</option>
              ))}
            </select>
            <select
              aria-label="Year"
              className="rounded-md bg-transparent px-1.5 py-1 text-label font-medium outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50"
              value={month.getFullYear()}
              onChange={(e) => setMonth(new Date(Number(e.target.value), month.getMonth(), 1))}
            >
              {yearOptions.map((year) => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
          </div>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Next month"
            disabled={Boolean(maxDate) && addMonths(month, 1) > new Date(maxDate!.getFullYear(), maxDate!.getMonth(), 1)}
            onClick={() => setMonth(addMonths(month, 1))}
          >
            <ChevronRightIcon className="size-4" />
          </Button>
        </div>

        <div className="grid grid-cols-7 gap-y-0.5" role="grid" aria-label="Calendar">
          {WEEKDAYS.map((day, index) => (
            <div
              key={index}
              className="flex h-8 items-center justify-center text-meta font-medium text-muted-foreground"
              aria-hidden
            >
              {day}
            </div>
          ))}

          <div
            ref={gridRef}
            className="col-span-7 grid grid-cols-7 gap-y-0.5 select-none"
            tabIndex={0}
            onKeyDown={handleKeyDown}
            // The popover opens onto the calendar, so focus belongs on the grid rather than
            // being left behind on the trigger.
            autoFocus={autoFocus}
          >
            {days.map((date) => {
              const outside = date.getMonth() !== month.getMonth()
              const disabled = isDisabled(date)
              const selected = isRange
                ? Boolean(shownRange && date >= shownRange.from && date <= shownRange.to)
                : isSameDay(date, selectedSingle)
              const isEdge =
                isRange && shownRange
                  ? isSameDay(date, shownRange.from) || isSameDay(date, shownRange.to)
                  : selected
              const inMiddle = selected && !isEdge

              return (
                <button
                  key={date.toISOString()}
                  type="button"
                  role="gridcell"
                  tabIndex={-1}
                  disabled={disabled}
                  aria-selected={selected}
                  aria-label={date.toDateString()}
                  onPointerDown={() => handleDayPointerDown(date)}
                  onPointerEnter={() => handleDayPointerEnter(date)}
                  onClick={(e) => handleDayClick(date, e)}
                  className={cn(
                    "relative flex h-9 w-9 items-center justify-center text-label tabular-nums transition-colors",
                    // Range fill is a square block so consecutive days join into one bar; the
                    // two ends get the rounding.
                    inMiddle && "rounded-none bg-[var(--brand-teal-tint)] text-foreground",
                    isEdge && selected && "rounded-lg bg-primary font-semibold text-primary-foreground",
                    !selected && !disabled && "rounded-lg hover:bg-[var(--brand-teal-tint)]",
                    outside && !selected && "text-muted-foreground/45",
                    disabled && "cursor-not-allowed text-muted-foreground/30 hover:bg-transparent",
                    isSameDay(date, today) && !selected && "font-semibold text-primary",
                    isSameDay(date, focusedDate) && "ring-2 ring-ring/50 ring-inset",
                  )}
                >
                  {date.getDate()}
                  {isSameDay(date, today) && (
                    <span
                      className={cn(
                        "absolute bottom-1 size-1 rounded-full",
                        selected && isEdge ? "bg-primary-foreground" : "bg-primary",
                      )}
                    />
                  )}
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
