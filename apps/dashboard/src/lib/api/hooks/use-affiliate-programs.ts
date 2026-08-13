"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { apiFetch } from "@/lib/api/client"
import type { AffiliateProgram } from "@/lib/api/types"

const affiliateProgramsKey = ["affiliate-programs"] as const

export function useAffiliatePrograms() {
  return useQuery({
    queryKey: affiliateProgramsKey,
    queryFn: () => apiFetch<AffiliateProgram[]>("/affiliate-programs"),
  })
}

export type AffiliateProgramPayload = {
  networkName: string
  programId?: string
  apiCredentials?: Record<string, string>
  hasCouponApi: boolean
}

export function useCreateAffiliateProgram() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: AffiliateProgramPayload) =>
      apiFetch<AffiliateProgram>("/affiliate-programs", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: affiliateProgramsKey })
    },
  })
}

export type UpdateAffiliateProgramPayload = Partial<AffiliateProgramPayload>

export function useUpdateAffiliateProgram(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (patch: UpdateAffiliateProgramPayload) =>
      apiFetch<AffiliateProgram>(`/affiliate-programs/${id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: affiliateProgramsKey })
    },
  })
}
