"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { apiFetch } from "@/lib/api/client"
import type { ScrapeStrategyName } from "@saverlly/shared-types"
import type { ScrapeSource, SelectorConfig } from "@/lib/api/types"

const scrapeSourcesKey = ["scrape-sources"] as const

export function useScrapeSources() {
  return useQuery({
    queryKey: scrapeSourcesKey,
    queryFn: () => apiFetch<ScrapeSource[]>("/scrape-sources"),
  })
}

export type ScrapeSourcePayload = {
  /** Omitted = GENERIC_CSS. A coupon site needs only merchantId; the backend builds the URL. */
  strategy?: ScrapeStrategyName
  url?: string
  /** Omitted (create) or explicitly null (edit, clearing a previous value) for a multi-merchant
   * source (selectorConfig.rowSelector set) — the backend resolves the merchant per row instead
   * of from a fixed id. */
  merchantId?: string | null
  /** Required for GENERIC_CSS; never sent for a coupon site. */
  selectorConfig?: SelectorConfig
  intervalMinutes?: number
}

export function useCreateScrapeSource() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: ScrapeSourcePayload) =>
      apiFetch<ScrapeSource>("/scrape-sources", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: scrapeSourcesKey })
    },
  })
}

export type UpdateScrapeSourcePayload = Partial<ScrapeSourcePayload> & { active?: boolean }

export function useUpdateScrapeSource(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (patch: UpdateScrapeSourcePayload) =>
      apiFetch<ScrapeSource>(`/scrape-sources/${id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: scrapeSourcesKey })
    },
  })
}

export function useDeleteScrapeSource() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/scrape-sources/${id}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: scrapeSourcesKey })
    },
  })
}

export function useRunScrapeSourceNow() {
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ queued: boolean }>(`/scrape-sources/${id}/run-now`, {
        method: "POST",
      }),
  })
}

/** Gives every active merchant its sources on the built-in coupon sites. Creates only missing
 * ones, so running it again is harmless. */
export function useBackfillCouponSites() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () =>
      apiFetch<{ merchants: number; created: number }>("/scrape-sources/backfill", {
        method: "POST",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: scrapeSourcesKey })
    },
  })
}
