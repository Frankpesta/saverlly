"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { apiFetch } from "@/lib/api/client"
import type { Balance, CommissionEvent, CommissionEventStatus, SyncNowResult } from "@/lib/api/types"

export type CommissionEventFilter = {
  kioskId?: string
  locationId?: string
  merchantId?: string
  status?: CommissionEventStatus
  dateFrom?: string
  dateTo?: string
}

function buildQuery(filter?: CommissionEventFilter): string {
  if (!filter) return ""
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(filter)) {
    if (value) params.set(key, value)
  }
  const query = params.toString()
  return query ? `?${query}` : ""
}

/** Admin: commission events platform-wide, optionally filtered (kiosk/location/merchant/status/date range). */
export function useCommissionEvents(filter?: CommissionEventFilter) {
  return useQuery({
    queryKey: ["commission-events", filter ?? {}],
    queryFn: () => apiFetch<CommissionEvent[]>(`/commission-events${buildQuery(filter)}`),
  })
}

export function useSyncCommissionsNow() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => apiFetch<SyncNowResult>("/commission-events/sync-now", { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["commission-events"] })
      queryClient.invalidateQueries({ queryKey: ["payouts"] })
    },
  })
}

/** Kiosk-owner: their own kiosk's full commission history. */
export function useMyCommissionEvents(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ["my", "commission-events"],
    queryFn: () => apiFetch<CommissionEvent[]>("/my/commission-events"),
    enabled: options?.enabled,
  })
}

/** Kiosk-owner: live-computed available vs pending balance. */
export function useMyBalance(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ["my", "balance"],
    queryFn: () => apiFetch<Balance>("/my/balance"),
    enabled: options?.enabled,
  })
}
