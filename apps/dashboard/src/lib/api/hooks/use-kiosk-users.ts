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
  name: string
  email: string
  role: KioskAssignableRole
  /** Which locations a LOCATION_MANAGER can see. Ignored for a KIOSK_OWNER, who sees all. */
  managedLocationIds?: string[]
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
  name: string
  email: string
  role: KioskAssignableRole
  disabled: boolean
  managedLocationIds: string[]
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

/** Mints a fresh first-time password and re-sends the welcome email. The reply carries the
 * password so the owner can read it out when the email doesn't arrive, which is the case the
 * client reported. */
export function useResendKioskUserPassword(kioskId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (userId: string) =>
      apiFetch<CreateKioskUserResult>(`/kiosks/${kioskId}/users/${userId}/resend-password`, {
        method: "POST",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: kioskUsersKey(kioskId) })
    },
  })
}

export function useDeleteKioskUser(kioskId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (userId: string) =>
      apiFetch<void>(`/kiosks/${kioskId}/users/${userId}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: kioskUsersKey(kioskId) })
    },
  })
}
