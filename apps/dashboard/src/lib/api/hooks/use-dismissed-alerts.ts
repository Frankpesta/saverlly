"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { apiFetch } from "@/lib/api/client"

const dismissedAlertsKey = ["dismissed-alerts"] as const

/** "Needs attention" derives its items client-side from other resources (see the admin
 * Overview page), so what this hook fetches is not the alerts themselves but the set of
 * alertKeys the current user has previously dismissed, used to filter that derived list. */
export function useDismissedAlerts() {
  return useQuery({
    queryKey: dismissedAlertsKey,
    queryFn: () => apiFetch<string[]>("/users/me/dismissed-alerts"),
  })
}

export function useDismissAlert() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (alertKey: string) =>
      apiFetch<void>("/users/me/dismissed-alerts", {
        method: "POST",
        body: JSON.stringify({ alertKey }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: dismissedAlertsKey }),
  })
}

export function useUndismissAlert() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (alertKey: string) =>
      apiFetch<void>(`/users/me/dismissed-alerts/${encodeURIComponent(alertKey)}`, {
        method: "DELETE",
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: dismissedAlertsKey }),
  })
}
