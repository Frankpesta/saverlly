"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { apiFetch } from "@/lib/api/client"
import type { AdminUser } from "@/lib/api/types"

const adminUsersKey = ["users", "admins"] as const

export function useAdminUsers() {
  return useQuery({
    queryKey: adminUsersKey,
    queryFn: () => apiFetch<AdminUser[]>("/users/admins"),
  })
}

export type CreateAdminUserPayload = {
  name: string
  email: string
}

export type CreateAdminUserResult = {
  user: AdminUser
  generatedPassword: string
}

export function useCreateAdminUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: CreateAdminUserPayload) =>
      apiFetch<CreateAdminUserResult>("/users/admins", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminUsersKey })
    },
  })
}

export type UpdateAdminUserPayload = Partial<{
  name: string
  disabled: boolean
}>

export function useUpdateAdminUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ userId, patch }: { userId: string; patch: UpdateAdminUserPayload }) =>
      apiFetch<AdminUser>(`/users/admins/${userId}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminUsersKey })
    },
  })
}

export function useDeleteAdminUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (userId: string) =>
      apiFetch<void>(`/users/admins/${userId}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminUsersKey })
    },
  })
}
