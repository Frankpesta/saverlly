const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/
const DATETIME_LOCAL_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/

/** Parses a "yyyy-MM-dd" string (the shape `<DatePicker>`/`<input type="date">` use) into a
 * local `Date` at midnight. Returns undefined for an empty/invalid string. */
export function parseDateValue(value: string): Date | undefined {
  const match = DATE_RE.exec(value)
  if (!match) return undefined
  const [, year, month, day] = match
  return new Date(Number(year), Number(month) - 1, Number(day))
}

/** Formats a `Date` back into the "yyyy-MM-dd" shape `<DatePicker>`/`<input type="date">` use. */
export function formatDateValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** Parses a "yyyy-MM-ddTHH:mm" string (the shape `<DateTimePicker>`/`<input type="datetime-local">`
 * use) into a local `Date`. Returns undefined for an empty/invalid string. */
export function parseDatetimeLocalValue(value: string): Date | undefined {
  const match = DATETIME_LOCAL_RE.exec(value)
  if (!match) return undefined
  const [, year, month, day, hours, minutes] = match
  return new Date(Number(year), Number(month) - 1, Number(day), Number(hours), Number(minutes))
}

/** Formats a `Date` back into the "yyyy-MM-ddTHH:mm" shape `<DateTimePicker>`/
 * `<input type="datetime-local">` use. */
export function formatDatetimeLocalValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** Convenience wrapper over `formatDatetimeLocalValue` accepting either a `Date` or an ISO
 * string. Matches the call shape used across the announcement create/edit forms. */
export function toDatetimeLocal(input: Date | string): string {
  return formatDatetimeLocalValue(typeof input === "string" ? new Date(input) : input)
}
