"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { apiFetch, apiUpload } from "@/lib/api/client"
import type { Promotion } from "@/lib/api/types"

const promotionsKey = ["promotions"] as const
const promotionKey = (id: string) => ["promotions", id] as const

export function usePromotions() {
  return useQuery({
    queryKey: promotionsKey,
    queryFn: () => apiFetch<Promotion[]>("/promotions"),
  })
}

export function usePromotion(id: string) {
  return useQuery({
    queryKey: promotionKey(id),
    queryFn: () => apiFetch<Promotion>(`/promotions/${id}`),
    enabled: !!id,
  })
}

export type PromotionPayload = {
  name: string
  imageSmallUrl: string
  imageLargeUrl: string
  clickUrl: string
  targetTags?: string[]
  locationIds?: string[]
  startAt: string
  endAt: string
  active?: boolean
}

export function useCreatePromotion() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: PromotionPayload) =>
      apiFetch<Promotion>("/promotions", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: promotionsKey })
    },
  })
}

export function useUpdatePromotion(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (patch: Partial<PromotionPayload>) =>
      apiFetch<Promotion>(`/promotions/${id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      }),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: promotionsKey })
      queryClient.setQueryData(promotionKey(updated.id), updated)
    },
  })
}

/** The two creative slots, and the exact dimensions the backend enforces for each. */
export const PROMOTION_CREATIVE_SIZES = {
  small: { width: 320, height: 100, label: "Popup banner" },
  large: { width: 728, height: 90, label: "Leaderboard banner" },
} as const

export type PromotionCreativeSize = keyof typeof PROMOTION_CREATIVE_SIZES

export function useUploadPromotionImage(size: PromotionCreativeSize) {
  return useMutation({
    // The `size` query param is what tells the backend which dimensions to enforce — a 728x90
    // uploaded into the `small` slot is rejected there, not silently accepted and squashed here.
    mutationFn: (file: File) =>
      apiUpload<{ url: string; width: number; height: number }>(
        `/promotions/upload-image?size=${size}`,
        file,
      ),
  })
}

export function useDeletePromotion() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/promotions/${id}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: promotionsKey })
    },
  })
}
