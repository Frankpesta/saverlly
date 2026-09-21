"use client"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { apiFetch } from "@/lib/api/client"

export type Reviewer = {
  id: string
  name: string
  email: string | null
  codeHint: string
  expiresAt: string
  maxInstallations: number
  revokedAt: string | null
  createdAt: string
  sessions: { id: string; createdAt: string; lastSeenAt: string | null }[]
}
export type ReviewersResponse = { enabled: boolean; reviewers: Reviewer[] }
export type CreateReviewerPayload = {
  name: string
  email?: string
  expiresAt: string
  maxInstallations: number
}
const key = ["reviewers"] as const
export function useReviewers() {
  return useQuery({
    queryKey: key,
    queryFn: () => apiFetch<ReviewersResponse>("/reviewers"),
    refetchInterval: 30_000,
  })
}
export function useCreateReviewer() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (payload: CreateReviewerPayload) =>
      apiFetch<Reviewer & { code: string }>("/reviewers", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: key }),
  })
}
export function useReviewerAccess() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (enabled: boolean) =>
      apiFetch("/reviewers/access", { method: "PATCH", body: JSON.stringify({ enabled }) }),
    onSuccess: () => client.invalidateQueries({ queryKey: key }),
  })
}
export function useRevokeReviewer() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/reviewers/${id}/revoke`, { method: "POST" }),
    onSuccess: () => client.invalidateQueries({ queryKey: key }),
  })
}
export function reviewerStatus(reviewer: Reviewer, enabled: boolean) {
  if (reviewer.revokedAt) return "Revoked"
  if (new Date(reviewer.expiresAt).getTime() <= Date.now()) return "Expired"
  if (!enabled) return "Paused"
  return reviewer.sessions.length ? "Active" : "Invited"
}
