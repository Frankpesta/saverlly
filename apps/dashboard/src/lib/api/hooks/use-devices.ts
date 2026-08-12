"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { apiFetch } from "@/lib/api/client"
import type { Device } from "@/lib/api/types"

const devicesKey = ["devices"] as const

export function useDevices() {
  return useQuery({
    queryKey: devicesKey,
    queryFn: () => apiFetch<Device[]>("/devices"),
  })
}

export function useUpdateDevice() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      apiFetch<Device>(`/devices/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ active }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: devicesKey })
    },
  })
}
