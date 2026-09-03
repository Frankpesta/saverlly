"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { apiFetch } from "@/lib/api/client"
import type { LocationSetupCode } from "@/lib/api/types"

const setupCodeKey = (locationId: string) => ["locations", locationId, "setup-code"] as const
// The locations list payload now carries each location's setup code so the table can show and
// generate one inline, so any mutation here has to refresh that list too, not just the
// per-location query the detail page reads.
const locationsKey = ["locations"] as const

export function useSetupCode(locationId: string) {
  return useQuery({
    queryKey: setupCodeKey(locationId),
    queryFn: async () => {
      const { setupCode } = await apiFetch<{ setupCode: LocationSetupCode | null }>(
        `/locations/${locationId}/setup-code`,
      )
      return setupCode
    },
    enabled: !!locationId,
  })
}

export function useCreateSetupCode(locationId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () =>
      apiFetch<LocationSetupCode>(`/locations/${locationId}/setup-code`, {
        method: "POST",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: setupCodeKey(locationId) })
      queryClient.invalidateQueries({ queryKey: locationsKey })
    },
  })
}

export function useUpdateSetupCode(locationId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (active: boolean) =>
      apiFetch<LocationSetupCode>(`/locations/${locationId}/setup-code`, {
        method: "PATCH",
        body: JSON.stringify({ active }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: setupCodeKey(locationId) })
      queryClient.invalidateQueries({ queryKey: locationsKey })
    },
  })
}
