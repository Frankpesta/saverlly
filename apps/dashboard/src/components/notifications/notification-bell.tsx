"use client"

import * as React from "react"
import { usePathname } from "next/navigation"
import { formatDistanceToNow } from "date-fns"
import { BellIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="relative rounded-xl border-transparent text-muted-foreground hover:border-border hover:bg-background hover:text-foreground"
            aria-label="Notifications"
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
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-80 rounded-xl border-border/80 p-1.5 shadow-xl">
          <div className="flex items-center justify-between px-1 py-1.5">
            <DropdownMenuLabel className="p-0 text-sm font-medium">Notifications</DropdownMenuLabel>
            {unreadCount > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-auto px-1.5 py-0.5 text-xs text-muted-foreground"
                onClick={() => markAllRead.mutate()}
                disabled={markAllRead.isPending}
              >
                Mark all read
              </Button>
            )}
          </div>
          <DropdownMenuSeparator />
          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 && (
              <p className="px-2 py-6 text-center text-sm text-muted-foreground">
                You&apos;re all caught up.
              </p>
            )}
            {items.map((notification) => (
              <button
                key={notification.id}
                type="button"
                onClick={() => handleRowClick(notification)}
                className="flex w-full flex-col gap-0.5 rounded-lg px-2 py-2 text-left hover:bg-accent"
              >
                <div className="flex items-center gap-2">
                  {!notification.readAt && (
                    <span className="size-1.5 shrink-0 rounded-full bg-[var(--brand-teal)]" />
                  )}
                  <span className="truncate text-sm font-medium">{notification.title}</span>
                </div>
                <p className="truncate text-xs text-muted-foreground">{notification.body}</p>
                <p className="text-[0.7rem] text-muted-foreground">
                  {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
                </p>
              </button>
            ))}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
      <NotificationDetailDialog
        notification={selected}
        basePath={basePath}
        open={detailOpen}
        onOpenChange={setDetailOpen}
      />
    </>
  )
}
