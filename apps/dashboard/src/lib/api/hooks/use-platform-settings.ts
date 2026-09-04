"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { apiFetch } from "@/lib/api/client"

export type PlatformSettings = {
  supportEmail: string
}

const publicKey = ["settings", "public"] as const
const allKey = ["settings", "all"] as const

/** The settings anyone may read. Unauthenticated on the server, so this is safe to call from
 * the portal regardless of role. */
export function usePublicPlatformSettings() {
  return useQuery({
    queryKey: publicKey,
    queryFn: () => apiFetch<Partial<PlatformSettings>>("/settings/public"),
    staleTime: 5 * 60 * 1000,
  })
}

/** Admin-only: every setting, including any that aren't publicly readable. */
export function usePlatformSettings(enabled = true) {
  return useQuery({
    queryKey: allKey,
    queryFn: () => apiFetch<PlatformSettings>("/settings"),
    enabled,
  })
}

export function useUpdatePlatformSettings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (patch: Partial<PlatformSettings>) =>
      apiFetch<PlatformSettings>("/settings", {
        method: "PATCH",
        body: JSON.stringify(patch),
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData(allKey, updated)
      // The portal's copy is derived from the same values, so it is stale now too.
      queryClient.invalidateQueries({ queryKey: publicKey })
    },
  })
}
