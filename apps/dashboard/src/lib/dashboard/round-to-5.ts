/** Rounds a percentage to the nearest multiple of 5, clamped to [0, 100]. Used for
 * revenue-share inputs, which only accept 5% increments (whole numbers, no decimals). */
export function roundToNearest5(value: number): number {
  if (Number.isNaN(value)) return value
  const clamped = Math.min(100, Math.max(0, value))
  return Math.round(clamped / 5) * 5
}
