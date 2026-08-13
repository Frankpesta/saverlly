import type { Device, Location } from "@/lib/api/types"

/** Zero-filled daily sums over the trailing `days` days (inclusive of today), keyed by ISO date (YYYY-MM-DD). */
export function bucketByDay<T>(
  items: T[],
  getDate: (item: T) => string | null,
  getValue: (item: T) => number,
  days: number,
): { date: string; value: number }[] {
  const buckets = new Map<string, number>()
  const today = new Date()
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    buckets.set(d.toISOString().slice(0, 10), 0)
  }

  for (const item of items) {
    const iso = getDate(item)
    if (!iso) continue
    const key = iso.slice(0, 10)
    if (buckets.has(key)) {
      buckets.set(key, (buckets.get(key) ?? 0) + getValue(item))
    }
  }

  return Array.from(buckets.entries()).map(([date, value]) => ({ date, value }))
}

/** Sums `getValue` per status, zero-filled for every status in `statuses` even if absent from `items`. */
export function sumByStatus<T, S extends string>(
  items: T[],
  getStatus: (item: T) => S,
  getValue: (item: T) => number,
  statuses: readonly S[],
): Record<S, number> {
  const result = Object.fromEntries(statuses.map((s) => [s, 0])) as Record<S, number>
  for (const item of items) {
    const status = getStatus(item)
    result[status] = (result[status] ?? 0) + getValue(item)
  }
  return result
}

/**
 * Percent change of this-calendar-month's sum vs last-calendar-month's sum.
 * Returns null when the prior month has no data — a "growth" number against a zero base is
 * meaningless (and would render as Infinity/NaN), so callers should omit the subtext in that case.
 */
export function monthOverMonthGrowth<T>(
  items: T[],
  getDate: (item: T) => string | null,
  getValue: (item: T) => number,
): number | null {
  const now = new Date()
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)

  let thisMonth = 0
  let lastMonth = 0
  for (const item of items) {
    const iso = getDate(item)
    if (!iso) continue
    const d = new Date(iso)
    if (d >= thisMonthStart) thisMonth += getValue(item)
    else if (d >= lastMonthStart && d < thisMonthStart) lastMonth += getValue(item)
  }

  if (lastMonth === 0) return null
  return ((thisMonth - lastMonth) / lastMonth) * 100
}

/** Active/disabled counts from the kill-switch `active` boolean — the only real device status signal. */
export function deviceCounts(devices: Pick<Device, "active">[]): {
  total: number
  active: number
  disabled: number
} {
  const active = devices.filter((d) => d.active).length
  return { total: devices.length, active, disabled: devices.length - active }
}

/** Top-N groups by summed value, most-valuable first. */
export function topByGroup<T>(
  items: T[],
  getKey: (item: T) => string,
  getValue: (item: T) => number,
  n: number,
): { key: string; total: number; count: number }[] {
  const totals = new Map<string, { total: number; count: number }>()
  for (const item of items) {
    const key = getKey(item)
    const existing = totals.get(key) ?? { total: 0, count: 0 }
    existing.total += getValue(item)
    existing.count += 1
    totals.set(key, existing)
  }
  return Array.from(totals.entries())
    .map(([key, v]) => ({ key, ...v }))
    .sort((a, b) => b.total - a.total)
    .slice(0, n)
}

/** Formats a `monthOverMonthGrowth` result as "+12.4%" / "-3.2%", or null to signal "omit the subtext". */
export function formatGrowthPct(growth: number | null): string | null {
  if (growth === null) return null
  const sign = growth >= 0 ? "+" : ""
  return `${sign}${growth.toFixed(1)}%`
}

/** deviceId -> kioskId, joined through each device's location. Devices with no matching location are omitted. */
export function buildDeviceKioskMap(
  devices: Pick<Device, "id" | "locationId">[],
  locations: Pick<Location, "id" | "kioskId">[],
): Map<string, string> {
  const locationKiosk = new Map(locations.map((l) => [l.id, l.kioskId]))
  const map = new Map<string, string>()
  for (const device of devices) {
    const kioskId = locationKiosk.get(device.locationId)
    if (kioskId) map.set(device.id, kioskId)
  }
  return map
}
