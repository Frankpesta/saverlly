"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { apiFetch } from "@/lib/api/client"
import type { UserProfile } from "@/lib/api/types"

const currentUserKey = ["users", "me"]

export function useCurrentUser() {
  return useQuery({
    queryKey: currentUserKey,
    queryFn: () => apiFetch<UserProfile>("/users/me"),
  })
}

export function useUpdateCurrentUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (patch: { name?: string; email?: string }) =>
      apiFetch<UserProfile>("/users/me", {
        method: "PATCH",
        body: JSON.stringify(patch),
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData(currentUserKey, updated)
    },
  })
}
