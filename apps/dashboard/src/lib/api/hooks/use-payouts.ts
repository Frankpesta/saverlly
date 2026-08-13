"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { apiFetch } from "@/lib/api/client"
import type { Payout } from "@/lib/api/types"

/** Admin: every payout platform-wide, with kiosk name + Stripe connection status inlined. */
export function usePayouts() {
  return useQuery({
    queryKey: ["payouts"],
    queryFn: () => apiFetch<Payout[]>("/payouts"),
  })
}

/** Admin: triggers the real Stripe transfer for a pending payout. */
export function useProcessPayout() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<Payout>(`/payouts/${id}/process`, {
        method: "POST",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payouts"] })
    },
  })
}

/** Kiosk-owner: their own kiosk's payouts. */
export function useMyPayouts() {
  return useQuery({
    queryKey: ["my", "payouts"],
    queryFn: () => apiFetch<Payout[]>("/my/payouts"),
  })
}

/** Kiosk-owner: mints a fresh Stripe Connect Express onboarding link for their own kiosk. */
export function useStripeOnboard() {
  return useMutation({
    mutationFn: () =>
      apiFetch<{ url: string }>("/my/stripe/onboard", {
        method: "POST",
      }),
  })
}
