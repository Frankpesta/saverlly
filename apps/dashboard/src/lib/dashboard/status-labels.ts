import type { CommissionEventStatus, KioskStatus, PayoutStatus } from "@/lib/api/types"
import type { badgeVariants } from "@/components/ui/badge"
import type { VariantProps } from "class-variance-authority"

type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>["variant"]>

export const COMMISSION_STATUS_LABEL: Record<CommissionEventStatus, string> = {
  CONFIRMED: "Confirmed",
  PENDING: "Pending",
  REVERSED: "Reversed",
}

export const COMMISSION_STATUS_BADGE_VARIANT: Record<CommissionEventStatus, BadgeVariant> = {
  CONFIRMED: "success",
  PENDING: "warning",
  REVERSED: "destructive",
}

export const PAYOUT_STATUS_LABEL: Record<PayoutStatus, string> = {
  paid: "Paid",
  processing: "Processing",
  pending: "Pending",
  failed: "Failed",
}

export const PAYOUT_STATUS_BADGE_VARIANT: Record<PayoutStatus, BadgeVariant> = {
  paid: "success",
  processing: "info",
  pending: "warning",
  failed: "destructive",
}

export const KIOSK_STATUS_LABEL: Record<KioskStatus, string> = {
  ACTIVE: "Active",
  INACTIVE: "Inactive",
}

export const KIOSK_STATUS_BADGE_VARIANT: Record<KioskStatus, BadgeVariant> = {
  ACTIVE: "success",
  INACTIVE: "destructive",
}

/** Client-computed from an announcement's startAt/endAt window (see each announcements list
 *  page's own `statusFor`) — not a persisted backend field, but still a real status worth the
 *  same centralized color treatment as the persisted ones above. */
export type AnnouncementStatus = "Scheduled" | "Active" | "Expired"

export const ANNOUNCEMENT_STATUS_BADGE_VARIANT: Record<AnnouncementStatus, BadgeVariant> = {
  Scheduled: "info",
  Active: "success",
  Expired: "secondary",
}
