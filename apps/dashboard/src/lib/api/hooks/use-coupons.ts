"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { apiFetch } from "@/lib/api/client"
import type { Coupon, CouponDiscountType } from "@/lib/api/types"

// No server-side aggregate exists for platform-wide coupon success rate, /coupons is the only
// source, and it's cursor-paginated. We page through it ourselves, capped at 10 pages (1000
// coupons) as a sane ceiling so one dashboard load can't page forever on a huge catalog.
const PAGE_LIMIT = 100
const MAX_PAGES = 10

async function fetchAllCoupons(): Promise<Coupon[]> {
  const all: Coupon[] = []
  let cursor: string | undefined
  for (let page = 0; page < MAX_PAGES; page++) {
    const query = new URLSearchParams({ limit: String(PAGE_LIMIT) })
    if (cursor) query.set("cursor", cursor)
    const batch = await apiFetch<Coupon[]>(`/coupons?${query.toString()}`)
    all.push(...batch)
    if (batch.length < PAGE_LIMIT) break
    cursor = batch[batch.length - 1]?.id
    if (!cursor) break
  }
  return all
}

/** Admin-only. KIOSK_OWNER gets a 403 here, so this hook must never be called from a portal page. */
export function useCoupons() {
  return useQuery({
    queryKey: ["coupons"],
    queryFn: fetchAllCoupons,
  })
}

export type CouponPayload = {
  merchantId: string
  code: string
  description?: string
  discountType?: CouponDiscountType
  discountValue?: number
  expiresAt?: string
}

export function useCreateCoupon() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: CouponPayload) =>
      apiFetch<Coupon>("/coupons", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["coupons"] })
    },
  })
}

export type UpdateCouponPayload = Partial<Omit<CouponPayload, "merchantId">> & { active?: boolean }

export function useUpdateCoupon(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (patch: UpdateCouponPayload) =>
      apiFetch<Coupon>(`/coupons/${id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["coupons"] })
    },
  })
}

export function useDeleteCoupon() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/coupons/${id}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["coupons"] })
    },
  })
}
