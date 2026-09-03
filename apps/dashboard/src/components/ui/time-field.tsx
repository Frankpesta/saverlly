"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

/* A masked h:mm AM/PM input, the time counterpart to date-field.tsx.
 *
 * Same keydown-driven buffer as the date field, and for the same reason: a controlled input
 * that rewrites its own value on every keystroke drops characters under fast typing. The
 * buffer here is up to four digits (hhmm) plus a period, so `0330p` types out as `03:30 PM`.
 *
 * Value in and out is 24-hour "HH:mm", matching what `<input type="time">` uses, so this stays
 * a drop-in for the existing call sites. */

export type Period = "AM" | "PM"

export function formatTimeDigits(digits: string, period: Period | null): string {
  const d = digits.slice(0, 4)
  const core = d.length <= 2 ? d : `${d.slice(0, 2)}:${d.slice(2)}`
  return period && core ? `${core} ${period}` : core
}

/** "0330" + "PM" -> "15:30". Incomplete or out-of-range input returns undefined rather than
 * silently clamping, so the caller can leave the previous value alone. */
export function timeDigitsToValue(digits: string, period: Period | null): string | undefined {
  if (digits.length !== 4) return undefined
  const hour12 = Number(digits.slice(0, 2))
  const minute = Number(digits.slice(2, 4))
  if (hour12 < 1 || hour12 > 12 || minute > 59) return undefined
  const effective = period ?? "AM"
  const hour24 = effective === "AM" ? hour12 % 12 : (hour12 % 12) + 12
  return `${String(hour24).padStart(2, "0")}:${String(minute).padStart(2, "0")}`
}

export function valueToTimeDigits(value: string): { digits: string; period: Period | null } {
  if (!/^\d{2}:\d{2}$/.test(value)) return { digits: "", period: null }
  const [h, m] = value.split(":").map(Number)
  const period: Period = h >= 12 ? "PM" : "AM"
  const hour12 = h % 12 === 0 ? 12 : h % 12
  return {
    digits: `${String(hour12).padStart(2, "0")}${String(m).padStart(2, "0")}`,
    period,
  }
}

/** The separator sits after the 2nd digit. */
function charIndexForDigit(digitIndex: number): number {
  return digitIndex + (digitIndex >= 2 ? 1 : 0)
}

function digitIndexForChar(charIndex: number, text: string): number {
  return text.slice(0, charIndex).replace(/\D/g, "").length
}

export function TimeField({
  id,
  digits,
  period,
  onChange,
  disabled,
  required,
  className,
  trailing,
  placeholder = "hh:mm AM",
  "aria-invalid": ariaInvalid,
  "aria-label": ariaLabel = "Time",
}: {
  id?: string
  digits: string
  period: Period | null
  onChange: (next: { digits: string; period: Period | null }) => void
  disabled?: boolean
  required?: boolean
  className?: string
  trailing?: React.ReactNode
  placeholder?: string
  "aria-invalid"?: boolean
  "aria-label"?: string
}) {
  const inputRef = React.useRef<HTMLInputElement>(null)
  const caretDigit = React.useRef<number | null>(null)
  const text = formatTimeDigits(digits, period)

  React.useLayoutEffect(() => {
    const input = inputRef.current
    if (!input || caretDigit.current === null) return
    const index = Math.min(charIndexForDigit(caretDigit.current), input.value.length)
    caretDigit.current = null
    input.setSelectionRange(index, index)
  })

  function apply(nextDigits: string, nextPeriod: Period | null, caret: number) {
    caretDigit.current = Math.max(0, Math.min(4, caret))
    onChange({ digits: nextDigits, period: nextPeriod })
  }

  function selectionAsDigits() {
    const input = inputRef.current
    if (!input) return { start: digits.length, end: digits.length }
    const start = digitIndexForChar(input.selectionStart ?? 0, input.value)
    const end = digitIndexForChar(input.selectionEnd ?? 0, input.value)
    return { start: Math.min(start, end), end: Math.max(start, end) }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.metaKey || event.ctrlKey || event.altKey) return

    const key = event.key
    const { start, end } = selectionAsDigits()
    const hasSelection = end > start

    // A/P anywhere in the field flips the period, so "0330p" works as one continuous string.
    if (key.toLowerCase() === "a" || key.toLowerCase() === "p") {
      event.preventDefault()
      apply(digits, key.toLowerCase() === "a" ? "AM" : "PM", start)
      return
    }

    if (/^\d$/.test(key)) {
      event.preventDefault()
      const next = (digits.slice(0, start) + key + digits.slice(hasSelection ? end : start)).slice(0, 4)
      // Typing an hour of 3 clearly means 03, so jump the caret past the padded slot rather
      // than waiting for a second digit that is never coming.
      apply(next, period, start + 1)
      return
    }

    if (key === "Backspace") {
      event.preventDefault()
      if (hasSelection) apply(digits.slice(0, start) + digits.slice(end), period, start)
      else if (start > 0) apply(digits.slice(0, start - 1) + digits.slice(start), period, start - 1)
      return
    }

    if (key === "Delete") {
      event.preventDefault()
      if (hasSelection) apply(digits.slice(0, start) + digits.slice(end), period, start)
      else apply(digits.slice(0, start) + digits.slice(start + 1), period, start)
      return
    }

    if (key === "ArrowUp" || key === "ArrowDown") {
      event.preventDefault()
      const direction = key === "ArrowUp" ? 1 : -1
      const value = timeDigitsToValue(digits, period)
      const base = value ? Number(value.slice(0, 2)) * 60 + Number(value.slice(3)) : 12 * 60
      // Hour segment steps by an hour, minute segment by a minute.
      const delta = start < 2 ? 60 : 1
      const total = (base + delta * direction + 24 * 60) % (24 * 60)
      const hh = Math.floor(total / 60)
      const mm = total % 60
      const nextPeriod: Period = hh >= 12 ? "PM" : "AM"
      const hour12 = hh % 12 === 0 ? 12 : hh % 12
      apply(
        `${String(hour12).padStart(2, "0")}${String(mm).padStart(2, "0")}`,
        nextPeriod,
        start,
      )
    }
  }

  function handlePaste(event: React.ClipboardEvent<HTMLInputElement>) {
    event.preventDefault()
    const raw = event.clipboardData.getData("text")
    const pastedDigits = raw.replace(/\D/g, "").slice(0, 4)
    const pastedPeriod: Period | null = /p/i.test(raw) ? "PM" : /a/i.test(raw) ? "AM" : period
    if (pastedDigits) apply(pastedDigits, pastedPeriod, pastedDigits.length)
  }

  return (
    <div
      className={cn(
        "flex h-10 w-full items-center gap-1 rounded-lg border border-input bg-transparent pr-1 pl-3 shadow-xs transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30",
        disabled && "pointer-events-none opacity-50",
        ariaInvalid && "border-destructive ring-3 ring-destructive/20",
        className,
      )}
    >
      <input
        ref={inputRef}
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder={placeholder}
        aria-label={ariaLabel}
        aria-invalid={ariaInvalid}
        required={required}
        disabled={disabled}
        value={text}
        onChange={() => {}}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        className="min-w-0 flex-1 bg-transparent text-sm tabular-nums outline-none placeholder:text-muted-foreground"
      />
      {trailing}
    </div>
  )
}
