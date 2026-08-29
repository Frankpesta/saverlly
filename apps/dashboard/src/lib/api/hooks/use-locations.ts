"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { apiFetch } from "@/lib/api/client"
import type { Location } from "@/lib/api/types"

const locationsKey = ["locations"] as const
const locationKey = (id: string) => ["locations", id] as const

export function useLocations() {
  return useQuery({
    queryKey: locationsKey,
    queryFn: () => apiFetch<Location[]>("/locations"),
  })
}

export function useLocation(id: string) {
  return useQuery({
    queryKey: locationKey(id),
    queryFn: () => apiFetch<Location>(`/locations/${id}`),
    enabled: !!id,
  })
}

export type CreateLocationPayload = {
  /** Required for ADMIN (which kiosk this location belongs to); ignored for KIOSK_OWNER. */
  kioskId?: string
  name: string
  address: string
  city: string
  state: string
  zip: string
  latitude?: number
  longitude?: number
  tags?: string[]
}

export function useCreateLocation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: CreateLocationPayload) =>
      apiFetch<Location>("/locations", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: locationsKey })
    },
  })
}

export type UpdateLocationPayload = Partial<CreateLocationPayload>

export function useUpdateLocation(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (patch: UpdateLocationPayload) =>
      apiFetch<Location>(`/locations/${id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      }),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: locationsKey })
      queryClient.setQueryData(locationKey(updated.id), updated)
    },
  })
}

export function useDeleteLocation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/locations/${id}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      // Deleting a location cascades to its devices (and their tokens/activity history)
      // server-side, so the devices list is stale too, not just locations.
      queryClient.invalidateQueries({ queryKey: locationsKey })
      queryClient.invalidateQueries({ queryKey: ["devices"] })
    },
  })
}
