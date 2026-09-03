"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

/* A masked MM/DD/YYYY input.
 *
 * The client asked to be able to type `01012030` and have it format itself (feedback item 2b).
 * The previous field accepted several written formats but only parsed them on blur, so eight
 * bare digits were rejected and nothing formatted as you typed.
 *
 * Editing is driven from keydown against an authoritative digit buffer, not from reading the
 * input's value back on change. A controlled input that rewrites its own value on every
 * keystroke races with fast typing: React had not always flushed the previous render before
 * the next input event arrived, so characters were dropped and the caret drifted. Typing
 * 01012030 into a field that already held a date produced 01/02/2022. Owning the buffer and
 * calling preventDefault removes the race, and makes the caret position exact rather than
 * reconstructed. */

/** "01012030" -> "01/01/2030", "0101" -> "01/01", "0" -> "0". Partial input stays partial so
 * the field never fights the person typing it. */
export function formatDigits(digits: string): string {
  const d = digits.slice(0, 8)
  if (d.length <= 2) return d
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`
}

export function digitsOf(text: string): string {
  return text.replace(/\D/g, "").slice(0, 8)
}

/** Only a complete, real calendar date parses. Rejects 02/31 and friends by round-tripping
 * through Date and checking the components survived. */
export function parseDigits(digits: string): Date | undefined {
  if (digits.length !== 8) return undefined
  const month = Number(digits.slice(0, 2))
  const day = Number(digits.slice(2, 4))
  const year = Number(digits.slice(4, 8))
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1000) return undefined
  const date = new Date(year, month - 1, day)
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return undefined
  }
  return date
}

export function digitsFromDate(date: Date): string {
  const pad = (n: number, width = 2) => String(n).padStart(width, "0")
  return `${pad(date.getMonth() + 1)}${pad(date.getDate())}${pad(date.getFullYear(), 4)}`
}

/** Separators sit after the 2nd and 4th digit, so a digit index maps to a character index by
 * adding however many of those it has passed. */
function charIndexForDigit(digitIndex: number): number {
  return digitIndex + (digitIndex >= 2 ? 1 : 0) + (digitIndex >= 4 ? 1 : 0)
}

function digitIndexForChar(charIndex: number, text: string): number {
  return digitsOf(text.slice(0, charIndex)).length
}

export function DateField({
  id,
  value,
  onChange,
  onCommit,
  placeholder = "MM/DD/YYYY",
  disabled,
  required,
  className,
  trailing,
  "aria-invalid": ariaInvalid,
  "aria-label": ariaLabel,
}: {
  id?: string
  /** Digit buffer, 0 to 8 characters. */
  value: string
  onChange: (digits: string) => void
  /** Fired when the buffer holds a complete, valid date, when it empties, and on blur. */
  onCommit?: (date: Date | undefined) => void
  placeholder?: string
  disabled?: boolean
  required?: boolean
  className?: string
  /** Rendered inside the field on the right, typically the calendar toggle. Keeping it inside
   * replaces the detached icon button that made every date look like two controls. */
  trailing?: React.ReactNode
  "aria-invalid"?: boolean
  "aria-label"?: string
}) {
  const inputRef = React.useRef<HTMLInputElement>(null)
  const caretDigit = React.useRef<number | null>(null)

  const text = formatDigits(value)

  React.useLayoutEffect(() => {
    const input = inputRef.current
    if (!input || caretDigit.current === null) return
    const index = Math.min(charIndexForDigit(caretDigit.current), input.value.length)
    caretDigit.current = null
    input.setSelectionRange(index, index)
  })

  function apply(nextDigits: string, nextCaretDigit: number) {
    caretDigit.current = Math.max(0, Math.min(8, nextCaretDigit))
    onChange(nextDigits)
    if (nextDigits.length === 8) onCommit?.(parseDigits(nextDigits))
    else if (nextDigits.length === 0) onCommit?.(undefined)
  }

  function selectionAsDigits() {
    const input = inputRef.current
    if (!input) return { start: value.length, end: value.length }
    const start = digitIndexForChar(input.selectionStart ?? 0, input.value)
    const end = digitIndexForChar(input.selectionEnd ?? 0, input.value)
    return { start: Math.min(start, end), end: Math.max(start, end) }
  }

  function stepSegment(direction: 1 | -1) {
    const { start } = selectionAsDigits()
    const current = parseDigits(value) ?? new Date()
    const next = new Date(current)
    if (start < 2) next.setMonth(next.getMonth() + direction)
    else if (start < 4) next.setDate(next.getDate() + direction)
    else next.setFullYear(next.getFullYear() + direction)
    apply(digitsFromDate(next), start)
    onCommit?.(next)
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.metaKey || event.ctrlKey || event.altKey) return // let copy/paste/select-all work

    const { start, end } = selectionAsDigits()
    const hasSelection = end > start

    if (/^\d$/.test(event.key)) {
      event.preventDefault()
      const from = hasSelection ? start : start
      const to = hasSelection ? end : start
      const next = (value.slice(0, from) + event.key + value.slice(to)).slice(0, 8)
      apply(next, from + 1)
      return
    }

    if (event.key === "Backspace") {
      event.preventDefault()
      if (hasSelection) {
        apply(value.slice(0, start) + value.slice(end), start)
      } else if (start > 0) {
        apply(value.slice(0, start - 1) + value.slice(start), start - 1)
      }
      return
    }

    if (event.key === "Delete") {
      event.preventDefault()
      if (hasSelection) apply(value.slice(0, start) + value.slice(end), start)
      else apply(value.slice(0, start) + value.slice(start + 1), start)
      return
    }

    if (event.key === "ArrowUp") {
      event.preventDefault()
      stepSegment(1)
      return
    }
    if (event.key === "ArrowDown") {
      event.preventDefault()
      stepSegment(-1)
    }
  }

  function handlePaste(event: React.ClipboardEvent<HTMLInputElement>) {
    event.preventDefault()
    const pasted = digitsOf(event.clipboardData.getData("text"))
    if (!pasted) return
    const { start, end } = selectionAsDigits()
    const next = (value.slice(0, start) + pasted + value.slice(end)).slice(0, 8)
    apply(next, start + pasted.length)
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
        // Every edit path is handled in keydown/paste, so this only exists to keep React from
        // warning about a controlled input without a change handler.
        onChange={() => {}}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onBlur={() => onCommit?.(parseDigits(value))}
        className="min-w-0 flex-1 bg-transparent text-sm tabular-nums outline-none placeholder:text-muted-foreground"
      />
      {trailing}
    </div>
  )
}
