import type { CommissionEventStatus, PayoutStatus } from "@/lib/api/types"

export const COMMISSION_STATUS_LABEL: Record<CommissionEventStatus, string> = {
  CONFIRMED: "Confirmed",
  PENDING: "Pending",
  REVERSED: "Reversed",
}

export const COMMISSION_STATUS_BADGE_VARIANT: Record<
  CommissionEventStatus,
  "default" | "secondary" | "destructive"
> = {
  CONFIRMED: "default",
  PENDING: "secondary",
  REVERSED: "destructive",
}

export const PAYOUT_STATUS_LABEL: Record<PayoutStatus, string> = {
  paid: "Paid",
  processing: "Processing",
  pending: "Pending",
  failed: "Failed",
}

export const PAYOUT_STATUS_BADGE_VARIANT: Record<
  PayoutStatus,
  "default" | "secondary" | "destructive"
> = {
  paid: "default",
  processing: "secondary",
  pending: "secondary",
  failed: "destructive",
}
