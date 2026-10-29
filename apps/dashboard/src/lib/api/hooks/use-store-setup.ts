"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type {
  CurrentStoreSetupSessionResponse,
  IssuedStoreSetupCode,
  StoreSetupSessionView,
} from "@saverlly/shared-types"
import { apiFetch } from "@/lib/api/client"
import type { Merchant } from "@/lib/api/types"

const merchantsKey = ["merchants"] as const
const merchantKey = (id: string) => ["merchants", id] as const
const setupSessionKey = (merchantId: string) => ["merchants", merchantId, "setup-session"] as const

// While the dashboard waits on the extension (code shown, or extension connected but nothing
// submitted yet) it checks often, so "Connected" and the result appear within seconds. A
// submitted draft can still be replaced by the extension, so it keeps checking, just less often.
const WAITING_POLL_MS = 3_000
const DRAFT_POLL_MS = 15_000

export function storeSetupPollInterval(session: StoreSetupSessionView | null | undefined) {
  if (!session) return false
  if (session.state === "PENDING" || session.state === "CONNECTED") return WAITING_POLL_MS
  if (session.state === "SUBMITTED" && session.extensionActive) return DRAFT_POLL_MS
  return false
}

/** Admin-only. The store's most recent setup session, or null if it never had one. */
export function useStoreSetupSession(merchantId: string) {
  return useQuery({
    queryKey: setupSessionKey(merchantId),
    queryFn: async () =>
      (
        await apiFetch<CurrentStoreSetupSessionResponse>(
          `/merchants/${merchantId}/setup-sessions/current`,
        )
      ).session,
    enabled: !!merchantId,
    refetchInterval: (query) => storeSetupPollInterval(query.state.data),
  })
}

/** Issues a one-time code. The plaintext code is only in this response; callers keep it. */
export function useIssueStoreSetupCode(merchantId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () =>
      apiFetch<IssuedStoreSetupCode>(`/merchants/${merchantId}/setup-sessions`, {
        method: "POST",
      }),
    onSuccess: ({ session }) => {
      queryClient.setQueryData(setupSessionKey(merchantId), session)
    },
  })
}

/** The Save: copies the submitted draft onto the store's live checkout recipe. */
export function useApplyStoreSetup(merchantId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (sessionId: string) =>
      apiFetch<{ session: StoreSetupSessionView; merchant: Merchant }>(
        `/merchants/${merchantId}/setup-sessions/${sessionId}/apply`,
        { method: "POST" },
      ),
    onSuccess: ({ session, merchant }) => {
      queryClient.setQueryData(setupSessionKey(merchantId), session)
      queryClient.setQueryData(merchantKey(merchantId), merchant)
      queryClient.invalidateQueries({ queryKey: merchantsKey, exact: true })
    },
    // A 409 means the session moved on (resubmitted, cancelled or already saved): show what
    // it is now rather than the stale draft.
    onError: () => queryClient.invalidateQueries({ queryKey: setupSessionKey(merchantId) }),
  })
}

export function useCancelStoreSetup(merchantId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (sessionId: string) =>
      apiFetch<StoreSetupSessionView>(
        `/merchants/${merchantId}/setup-sessions/${sessionId}/cancel`,
        { method: "POST" },
      ),
    onSuccess: (session) => {
      queryClient.setQueryData(setupSessionKey(merchantId), session)
    },
    onError: () => queryClient.invalidateQueries({ queryKey: setupSessionKey(merchantId) }),
  })
}
