"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { apiFetch, apiUpload } from "@/lib/api/client"
import type { Announcement, AnnouncementRepeatPolicy } from "@/lib/api/types"

const announcementsKey = ["announcements"] as const
const announcementKey = (id: string) => ["announcements", id] as const

export function useAnnouncements() {
  return useQuery({
    queryKey: announcementsKey,
    queryFn: () => apiFetch<Announcement[]>("/announcements"),
  })
}

export function useAnnouncement(id: string) {
  return useQuery({
    queryKey: announcementKey(id),
    queryFn: () => apiFetch<Announcement>(`/announcements/${id}`),
    enabled: !!id,
  })
}

export type AnnouncementPayload = {
  /** Required for ADMIN (which kiosk this announcement belongs to); ignored for KIOSK_OWNER. */
  kioskId?: string
  locationIds?: string[]
  title: string
  body: string
  mediaUrl?: string
  startAt: string
  endAt: string
  repeatPolicy?: AnnouncementRepeatPolicy
  maxDisplayCount?: number
  /** ADMIN-only: platform-wide broadcast to every device across every kiosk. */
  broadcast?: boolean
}

export function useCreateAnnouncement() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: AnnouncementPayload) =>
      apiFetch<Announcement>("/announcements", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: announcementsKey })
    },
  })
}

export function useUpdateAnnouncement(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (patch: Partial<AnnouncementPayload>) =>
      apiFetch<Announcement>(`/announcements/${id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      }),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: announcementsKey })
      queryClient.setQueryData(announcementKey(updated.id), updated)
    },
  })
}

export function useUploadAnnouncementImage() {
  return useMutation({
    mutationFn: (file: File) => apiUpload<{ url: string }>("/announcements/upload-image", file),
  })
}

export function useDeleteAnnouncement() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/announcements/${id}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: announcementsKey })
    },
  })
}
