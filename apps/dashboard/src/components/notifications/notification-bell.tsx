"use client"

import * as React from "react"
import { usePathname } from "next/navigation"
import { formatDistanceToNow } from "date-fns"
import { BellIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { NotificationDetailDialog } from "@/components/notifications/notification-detail-dialog"
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
  useUnreadCount,
} from "@/lib/api/hooks/use-notifications"
import type { Notification } from "@/lib/api/types"

export function NotificationBell() {
  const pathname = usePathname()
  const basePath = pathname.startsWith("/admin") ? "/admin" : "/portal"

  const { data: notifications } = useNotifications()
  const { data: unread } = useUnreadCount()
  const markRead = useMarkNotificationRead()
  const markAllRead = useMarkAllNotificationsRead()

  const [open, setOpen] = React.useState(false)
  const [selected, setSelected] = React.useState<Notification | null>(null)
  const [detailOpen, setDetailOpen] = React.useState(false)

  const unreadCount = unread?.count ?? 0
  const items = notifications ?? []

  function handleRowClick(notification: Notification) {
    if (!notification.readAt) {
      markRead.mutate(notification.id)
    }
    setSelected(notification)
    setDetailOpen(true)
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="relative rounded-xl border-transparent text-muted-foreground hover:border-border hover:bg-background hover:text-foreground"
        aria-label="Notifications"
        onClick={() => setOpen(true)}
      >
        <BellIcon className="size-4" />
        {unreadCount > 0 && (
          <Badge
            variant="default"
            className="absolute -right-1 -top-1 h-4 min-w-4 justify-center rounded-full px-1 text-[0.65rem]"
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </Badge>
        )}
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-md">
          <SheetHeader className="border-b border-border/70 px-5 py-4">
            <SheetTitle>Notifications</SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-3 py-3">
            {items.length === 0 && (
              <p className="px-2 py-10 text-center text-sm text-muted-foreground">
                You&apos;re all caught up.
              </p>
            )}
            <div className="flex flex-col gap-1">
              {items.map((notification) => (
                <button
                  key={notification.id}
                  type="button"
                  onClick={() => handleRowClick(notification)}
                  className="flex w-full flex-col gap-1 rounded-lg px-3 py-3 text-left hover:bg-accent"
                >
                  <div className="flex items-center gap-2">
                    {!notification.readAt && (
                      <span className="size-1.5 shrink-0 rounded-full bg-[var(--brand-teal)]" />
                    )}
                    <span className="truncate text-sm font-medium">{notification.title}</span>
                  </div>
                  <p className="line-clamp-2 text-xs text-muted-foreground">{notification.body}</p>
                  <p className="text-[0.7rem] font-normal text-muted-foreground/70">
                    {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
                  </p>
                </button>
              ))}
            </div>
          </div>
          {unreadCount > 0 && (
            <SheetFooter className="border-t border-border/70 p-4">
              <Button
                type="button"
                className="w-full"
                onClick={() => markAllRead.mutate()}
                disabled={markAllRead.isPending}
              >
                Mark all read
              </Button>
            </SheetFooter>
          )}
        </SheetContent>
      </Sheet>
      <NotificationDetailDialog
        notification={selected}
        basePath={basePath}
        open={detailOpen}
        onOpenChange={setDetailOpen}
      />
    </>
  )
}
