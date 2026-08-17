"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { apiFetch } from "@/lib/api/client"
import type { ScrapeSource, SelectorConfig } from "@/lib/api/types"

const scrapeSourcesKey = ["scrape-sources"] as const

export function useScrapeSources() {
  return useQuery({
    queryKey: scrapeSourcesKey,
    queryFn: () => apiFetch<ScrapeSource[]>("/scrape-sources"),
  })
}

export type ScrapeSourcePayload = {
  url: string
  merchantId: string
  selectorConfig: SelectorConfig
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

export function useRunScrapeSourceNow() {
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ queued: boolean }>(`/scrape-sources/${id}/run-now`, {
        method: "POST",
      }),
  })
}
