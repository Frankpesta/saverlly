"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { apiFetch } from "@/lib/api/client"
import type { Notification } from "@/lib/api/types"

// Polling, not a websocket — this app has no realtime infra anywhere else, and 30s is a
// reasonable balance for events (payout processed, Stripe status changed) that aren't
// time-critical to see instantly.
const POLL_INTERVAL_MS = 30_000

const notificationsKey = ["notifications"] as const
const unreadCountKey = ["notifications", "unread-count"] as const

export function useNotifications() {
  return useQuery({
    queryKey: notificationsKey,
    queryFn: () => apiFetch<Notification[]>("/notifications"),
    refetchInterval: POLL_INTERVAL_MS,
  })
}

export function useUnreadCount() {
  return useQuery({
    queryKey: unreadCountKey,
    queryFn: () => apiFetch<{ count: number }>("/notifications/unread-count"),
    refetchInterval: POLL_INTERVAL_MS,
  })
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ success: true }>(`/notifications/${id}/read`, { method: "PATCH" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notificationsKey })
      queryClient.invalidateQueries({ queryKey: unreadCountKey })
    },
  })
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => apiFetch<{ success: true }>("/notifications/read-all", { method: "PATCH" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notificationsKey })
      queryClient.invalidateQueries({ queryKey: unreadCountKey })
    },
  })
}
