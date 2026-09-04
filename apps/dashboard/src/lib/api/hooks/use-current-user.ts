"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { apiFetch, apiUpload } from "@/lib/api/client"
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

/** Uploads a profile photo. apiUpload rather than apiFetch: multipart needs the browser to
 * set its own boundary, which apiFetch's fixed application/json header would break. */
export function useUploadAvatar() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (file: File) => apiUpload<UserProfile>("/users/me/avatar", file),
    onSuccess: (updated) => {
      queryClient.setQueryData(currentUserKey, updated)
    },
  })
}

export function useRemoveAvatar() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => apiFetch<UserProfile>("/users/me/avatar", { method: "DELETE" }),
    onSuccess: (updated) => {
      queryClient.setQueryData(currentUserKey, updated)
    },
  })
}
