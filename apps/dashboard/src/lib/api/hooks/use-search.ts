"use client"

import { useQuery } from "@tanstack/react-query"
import { apiFetch } from "@/lib/api/client"
import type { SearchResult } from "@/lib/api/types"

export function useSearch(query: string) {
  return useQuery({
    queryKey: ["search", query],
    queryFn: () => apiFetch<SearchResult[]>(`/search?q=${encodeURIComponent(query)}`),
    enabled: query.trim().length >= 2,
  })
}
