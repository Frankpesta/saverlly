"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { apiFetch } from "@/lib/api/client"
import type { Kiosk, KioskContact, KioskStatus, KioskUser } from "@/lib/api/types"

const kiosksKey = ["kiosks"] as const
const kioskKey = (id: string) => ["kiosks", id] as const

export function useKiosks() {
  return useQuery({
    queryKey: kiosksKey,
    queryFn: () => apiFetch<Kiosk[]>("/kiosks"),
  })
}

export type CreateKioskPayload = {
  name: string
  revenueSharePct: number
  owner: { name: string; email: string }
}

export type CreateKioskResult = {
  kiosk: Kiosk
  owner: KioskUser
  generatedPassword: string
}

export function useCreateKiosk() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: CreateKioskPayload) =>
      apiFetch<CreateKioskResult>("/kiosks", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: kiosksKey })
    },
  })
}

export function useKiosk(id: string) {
  return useQuery({
    queryKey: kioskKey(id),
    queryFn: () => apiFetch<Kiosk>(`/kiosks/${id}`),
    enabled: !!id,
  })
}

export function useUpdateKioskStatus() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: KioskStatus }) =>
      apiFetch<Kiosk>(`/kiosks/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: kiosksKey })
      queryClient.setQueryData(kioskKey(updated.id), updated)
    },
  })
}

export type UpdateKioskPayload = Partial<{
  name: string
  revenueSharePct: number
}>

export function useUpdateKiosk(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (patch: UpdateKioskPayload) =>
      apiFetch<Kiosk>(`/kiosks/${id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      }),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: kiosksKey })
      queryClient.setQueryData(kioskKey(updated.id), updated)
    },
  })
}

export function useKioskContact(enabled = true) {
  return useQuery({
    queryKey: ["my", "kiosk-contact"],
    queryFn: () => apiFetch<KioskContact>("/my/kiosk-contact"),
    enabled,
  })
}

export function useDeleteKiosk() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/kiosks/${id}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      // Deleting a kiosk cascades to its locations/devices/announcements/payouts server-side.
      queryClient.invalidateQueries({ queryKey: kiosksKey })
      queryClient.invalidateQueries({ queryKey: ["locations"] })
      queryClient.invalidateQueries({ queryKey: ["devices"] })
      queryClient.invalidateQueries({ queryKey: ["announcements"] })
      queryClient.invalidateQueries({ queryKey: ["payouts"] })
    },
  })
}
