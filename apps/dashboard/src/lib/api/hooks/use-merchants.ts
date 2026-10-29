"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { apiFetch } from "@/lib/api/client"
import type { PlatformCheckResponse } from "@saverlly/shared-types"
import type { AttributionMethod, CheckoutRecipe, Merchant } from "@/lib/api/types"

const merchantsKey = ["merchants"] as const
const merchantKey = (id: string) => ["merchants", id] as const

/** Admin-only. KIOSK_OWNER gets a 403 here, so this hook must never be called from a portal page. */
export function useMerchants() {
  return useQuery({
    queryKey: merchantsKey,
    queryFn: () => apiFetch<Merchant[]>("/merchants"),
  })
}

export function useMerchant(id: string) {
  return useQuery({
    queryKey: merchantKey(id),
    queryFn: () => apiFetch<Merchant>(`/merchants/${id}`),
    enabled: !!id,
  })
}

export type MerchantPayload = {
  name: string
  domain: string
  attributionMethod: AttributionMethod
  affiliateTrackingUrl?: string
  affiliateUrlParamKey?: string
  affiliateUrlParamValue?: string
  affiliateSubIdParamKey?: string | null
  affiliateProgramId?: string
  checkoutRecipe?: CheckoutRecipe
}

export function useCreateMerchant() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: MerchantPayload) =>
      apiFetch<Merchant>("/merchants", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: merchantsKey })
    },
  })
}

export type UpdateMerchantPayload = Partial<MerchantPayload> & {
  active?: boolean
}

/** Reads the store's homepage again and records which shopping platform it runs on. */
export function useCheckMerchantPlatform(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () =>
      apiFetch<PlatformCheckResponse>(`/merchants/${id}/platform/check`, { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: merchantKey(id) }),
  })
}

export function useUpdateMerchant(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (patch: UpdateMerchantPayload) =>
      apiFetch<Merchant>(`/merchants/${id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      }),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: merchantsKey })
      queryClient.setQueryData(merchantKey(updated.id), updated)
    },
  })
}

export function useDeleteMerchant() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/merchants/${id}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: merchantsKey })
    },
  })
}
