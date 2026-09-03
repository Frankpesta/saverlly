import type { Promotion } from "@/lib/api/types"

/**
 * A promotion's real state is the combination of its schedule window and its manual `active`
 * kill switch, "Paused" beats every schedule-derived state, since a paused promotion is not
 * showing regardless of what its dates say.
 */
export type PromotionStatus = "Live" | "Scheduled" | "Ended" | "Paused"

export function promotionStatus(promotion: Promotion, now: number): PromotionStatus {
  if (!promotion.active) return "Paused"
  const start = new Date(promotion.startAt).getTime()
  const end = new Date(promotion.endAt).getTime()
  if (now < start) return "Scheduled"
  if (now > end) return "Ended"
  return "Live"
}

/**
 * Compact "Sep 1. Oct 3" range for the gallery cards. The year is appended only when the range
 * leaves the current one, so the common case stays short without ever being ambiguous.
 */
export function formatDateRange(startAt: string, endAt: string, now: number): string {
  const start = new Date(startAt)
  const end = new Date(endAt)
  const currentYear = new Date(now).getFullYear()
  const spansOtherYear =
    start.getFullYear() !== currentYear || end.getFullYear() !== currentYear
  const options: Intl.DateTimeFormatOptions = spansOtherYear
    ? { month: "short", day: "numeric", year: "numeric" }
    : { month: "short", day: "numeric" }
  return `${start.toLocaleDateString(undefined, options)} to ${end.toLocaleDateString(undefined, options)}`
}

/** Describes who a promotion reaches, from its union-style targeting. */
export function targetingSummary(promotion: Promotion): string {
  const parts: string[] = []
  if (promotion.targetTags.length > 0) parts.push(promotion.targetTags.join(", "))
  if (promotion.locationIds.length > 0) {
    parts.push(
      `${promotion.locationIds.length} location${promotion.locationIds.length === 1 ? "" : "s"}`,
    )
  }
  return parts.length === 0 ? "Everywhere" : parts.join(" · ")
}
