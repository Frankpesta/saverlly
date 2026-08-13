"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { apiFetch } from "@/lib/api/client"
import type { LocationSetupCode } from "@/lib/api/types"

const setupCodesKey = (locationId: string) => ["locations", locationId, "setup-codes"] as const

export function useSetupCodes(locationId: string) {
  return useQuery({
    queryKey: setupCodesKey(locationId),
    queryFn: () => apiFetch<LocationSetupCode[]>(`/locations/${locationId}/setup-codes`),
    enabled: !!locationId,
  })
}

export function useCreateSetupCode(locationId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () =>
      apiFetch<LocationSetupCode>(`/locations/${locationId}/setup-codes`, {
        method: "POST",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: setupCodesKey(locationId) })
    },
  })
}

export function useUpdateSetupCode(locationId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ codeId, active }: { codeId: string; active: boolean }) =>
      apiFetch<LocationSetupCode>(`/locations/${locationId}/setup-codes/${codeId}`, {
        method: "PATCH",
        body: JSON.stringify({ active }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: setupCodesKey(locationId) })
    },
  })
}
