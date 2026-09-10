"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { apiFetch } from "@/lib/api/client"
import type { LocationEmployeeWithLocation } from "@/lib/api/types"

const myEmployeesKey = ["my", "employees"] as const

export type CreateLocationEmployeeInput = {
  name: string
  title?: string
  phone?: string
  email?: string
}

export type UpdateLocationEmployeeInput = Partial<CreateLocationEmployeeInput>

/** The whole roster for the caller's kiosk, across every location. Backs the dedicated portal
 *  Employees page, not a single location's own page. */
export function useMyLocationEmployees() {
  return useQuery({
    queryKey: myEmployeesKey,
    queryFn: () => apiFetch<LocationEmployeeWithLocation[]>("/my/employees"),
  })
}

export function useCreateLocationEmployee() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ locationId, ...input }: CreateLocationEmployeeInput & { locationId: string }) =>
      apiFetch<LocationEmployeeWithLocation>(`/locations/${locationId}/employees`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: myEmployeesKey })
    },
  })
}

export function useUpdateLocationEmployee() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      locationId,
      id,
      patch,
    }: {
      locationId: string
      id: string
      patch: UpdateLocationEmployeeInput
    }) =>
      apiFetch<LocationEmployeeWithLocation>(`/locations/${locationId}/employees/${id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: myEmployeesKey })
    },
  })
}

export function useDeleteLocationEmployee() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ locationId, id }: { locationId: string; id: string }) =>
      apiFetch<void>(`/locations/${locationId}/employees/${id}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: myEmployeesKey })
    },
  })
}
