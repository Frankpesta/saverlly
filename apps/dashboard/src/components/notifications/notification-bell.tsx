"use client"

import * as React from "react"
import { usePathname } from "next/navigation"
import { formatDistanceToNow } from "date-fns"
import { BellIcon } from "lucide-react"
import { cn } from "@/lib/utils"
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
          <div className="flex-1 overflow-y-auto p-2">
            {items.length === 0 && (
              <p className="px-2 py-10 text-center text-body text-muted-foreground">
                Nothing new right now.
              </p>
            )}
            <div className="flex flex-col">
              {items.map((notification) => (
                <button
                  key={notification.id}
                  type="button"
                  onClick={() => handleRowClick(notification)}
                  className="flex w-full cursor-pointer flex-col gap-1 rounded-lg px-3 py-3.5 text-left transition-colors hover:bg-[var(--brand-teal-tint)]"
                >
                  {/* The time moves onto the title row, right-aligned. It used to sit directly
                      under the message in the same tight column, which is what the client
                      meant by the date being too close to the message and too prominent for
                      how little it matters. */}
                  <div className="flex w-full items-baseline gap-2">
                    {!notification.readAt && (
                      <span
                        className="size-1.5 shrink-0 translate-y-[-1px] rounded-full bg-[var(--brand-teal)]"
                        aria-label="Unread"
                      />
                    )}
                    <span
                      className={cn(
                        "min-w-0 flex-1 truncate text-label",
                        notification.readAt ? "text-foreground" : "font-semibold text-foreground",
                      )}
                    >
                      {notification.title}
                    </span>
                    <span className="shrink-0 text-meta text-muted-foreground/70">
                      {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
                    </span>
                  </div>
                  <p className={cn("line-clamp-2 text-body text-muted-foreground", !notification.readAt && "pl-3.5")}>
                    {notification.body}
                  </p>
                </button>
              ))}
            </div>
          </div>
          {/* Rendered whether or not anything is unread. Previously the whole footer unmounted
              once everything was read, so the panel lost its bottom padding and the last row
              sat flush against the edge. */}
          <SheetFooter className="border-t border-border/70 p-4">
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => markAllRead.mutate()}
              disabled={unreadCount === 0 || markAllRead.isPending}
            >
              {unreadCount > 0 ? `Mark all read (${unreadCount})` : "All caught up"}
            </Button>
          </SheetFooter>
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
