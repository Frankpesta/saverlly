"use client"

import Link from "next/link"
import { format, formatDistanceToNow } from "date-fns"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { Notification, NotificationType } from "@/lib/api/types"

const TYPE_LABEL: Record<NotificationType, string> = {
  KIOSK_OWNER_CREATED: "Account",
  LOCATION_MANAGER_CREATED: "Account",
  PAYOUT_PROCESSED: "Payout",
  STRIPE_ONBOARDING_CHANGED: "Stripe",
  COMMISSION_DIGEST: "Commissions",
}

// Every trigger that sets metadata today points at something on the Earnings/Payouts screen —
// neither payouts nor commission digests have a per-record detail route, so this links to the
// list page, not a specific row (same convention as global-search.tsx's hrefFor).
function actionFor(
  notification: Notification,
  basePath: string,
): { label: string; href: string } | null {
  switch (notification.type) {
    case "PAYOUT_PROCESSED":
      return basePath === "/admin"
        ? { label: "View payouts", href: "/admin/payouts" }
        : { label: "View earnings", href: "/portal/earnings" }
    case "STRIPE_ONBOARDING_CHANGED":
      return basePath === "/admin"
        ? { label: "View payouts", href: "/admin/payouts" }
        : { label: "View earnings", href: "/portal/earnings" }
    case "COMMISSION_DIGEST":
      return basePath === "/admin"
        ? { label: "View commissions", href: "/admin/commissions" }
        : { label: "View earnings", href: "/portal/earnings" }
    case "KIOSK_OWNER_CREATED":
    case "LOCATION_MANAGER_CREATED":
      return null
  }
}

export function NotificationDetailDialog({
  notification,
  basePath,
  open,
  onOpenChange,
}: {
  notification: Notification | null
  basePath: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const action = notification ? actionFor(notification, basePath) : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {notification && (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{TYPE_LABEL[notification.type]}</Badge>
                {!notification.readAt && (
                  <span className="size-1.5 rounded-full bg-[var(--brand-teal)]" />
                )}
              </div>
              <DialogTitle>{notification.title}</DialogTitle>
              <DialogDescription asChild>
                <span>{format(new Date(notification.createdAt), "PPp")} · {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}</span>
              </DialogDescription>
            </DialogHeader>

            <p className="px-4 text-sm text-foreground">{notification.body}</p>

            {action && (
              <DialogFooter>
                <Button asChild>
                  <Link href={action.href} onClick={() => onOpenChange(false)}>
                    {action.label}
                  </Link>
                </Button>
              </DialogFooter>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
