"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { apiFetch } from "@/lib/api/client"
import type { KioskAssignableRole, KioskUser } from "@/lib/api/types"

const kioskUsersKey = (kioskId: string) => ["kiosks", kioskId, "users"] as const

export function useKioskUsers(kioskId: string) {
  return useQuery({
    queryKey: kioskUsersKey(kioskId),
    queryFn: () => apiFetch<KioskUser[]>(`/kiosks/${kioskId}/users`),
    enabled: !!kioskId,
  })
}

export type CreateKioskUserPayload = {
  email: string
  role: KioskAssignableRole
}

export type CreateKioskUserResult = {
  user: KioskUser
  generatedPassword: string
}

export function useCreateKioskUser(kioskId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: CreateKioskUserPayload) =>
      apiFetch<CreateKioskUserResult>(`/kiosks/${kioskId}/users`, {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: kioskUsersKey(kioskId) })
    },
  })
}

export type UpdateKioskUserPayload = Partial<{
  role: KioskAssignableRole
  disabled: boolean
}>

export function useUpdateKioskUser(kioskId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ userId, patch }: { userId: string; patch: UpdateKioskUserPayload }) =>
      apiFetch<KioskUser>(`/kiosks/${kioskId}/users/${userId}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: kioskUsersKey(kioskId) })
    },
  })
}
