"use client"

import { useQuery } from "@tanstack/react-query"
import { apiFetch } from "@/lib/api/client"
import type { UserProfile } from "@/lib/api/types"

export function useCurrentUser() {
  return useQuery({
    queryKey: ["users", "me"],
    queryFn: () => apiFetch<UserProfile>("/users/me"),
  })
}
