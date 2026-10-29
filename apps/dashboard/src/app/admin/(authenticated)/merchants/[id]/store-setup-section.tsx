"use client"

import * as React from "react"
import { toast } from "sonner"
import {
  CheckCircle2Icon,
  CircleMinusIcon,
  CopyIcon,
  Loader2Icon,
  RefreshCwIcon,
  WandSparklesIcon,
  XCircleIcon,
} from "lucide-react"
import type {
  StoreSetupCheck,
  StoreSetupCheckKey,
  StoreSetupSessionView,
} from "@saverlly/shared-types"
import { InlineQueryError } from "@/components/dashboard/query-state"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { ApiError } from "@/lib/api/client"
import {
  useApplyStoreSetup,
  useCancelStoreSetup,
  useIssueStoreSetupCode,
  useStoreSetupSession,
} from "@/lib/api/hooks/use-store-setup"
import type { Merchant } from "@/lib/api/types"
import { relativeTime } from "@/lib/relative-time"

/** Plain-language names for each step the extension checks, in the order they're shown. */
const CHECK_LABELS: Record<StoreSetupCheckKey, string> = {
  checkoutPage: "Checkout page",
  revealLink: "Promo code link",
  promoField: "Promo code box",
  applyButton: "Apply button",
  cartTotal: "Order total",
  failureMessage: "Message for a rejected code",
  successMessage: "Message for an accepted code",
  applyMode: "Trying one code after another",
}
const CHECK_ORDER = Object.keys(CHECK_LABELS) as StoreSetupCheckKey[]

const totalFormatter = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" })

/** The plaintext code exists only in the issue response, so it's held here, tied to the
 * session it belongs to. A reload loses it on purpose: the code is never retrievable again. */
type IssuedCode = { sessionId: string; code: string }

function useNow(intervalMs: number) {
  const [now, setNow] = React.useState(() => Date.now())
  React.useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(timer)
  }, [intervalMs])
  return now
}

function formatCountdown(ms: number) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, "0")}`
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback
}

/**
 * "Set up with extension": the admin gets a one-time code here, enters it in the extension's
 * options page on the computer they'll use, and the extension sends back a draft recipe with a
 * plain-language test result. Nothing reaches the store until Save here.
 */
export function StoreSetupSection({ merchant }: { merchant: Merchant }) {
  const { data: session, isLoading, isError, refetch } = useStoreSetupSession(merchant.id)
  const issueCode = useIssueStoreSetupCode(merchant.id)
  const applySetup = useApplyStoreSetup(merchant.id)
  const cancelSetup = useCancelStoreSetup(merchant.id)
  const [issued, setIssued] = React.useState<IssuedCode | null>(null)
  const [confirm, setConfirm] = React.useState<"replace-draft" | "save-failed" | null>(null)

  const hasWaitingDraft = session?.state === "SUBMITTED"

  function issue() {
    issueCode.mutate(undefined, {
      onSuccess: ({ code, session: created }) => setIssued({ sessionId: created.id, code }),
      onError: (error) => toast.error(errorMessage(error, "Could not create a setup code.")),
    })
  }

  function requestNewCode() {
    // A new code discards a draft still waiting for review, so that needs saying first.
    if (hasWaitingDraft) setConfirm("replace-draft")
    else issue()
  }

  function save() {
    if (!session) return
    applySetup.mutate(session.id, {
      onSuccess: () => toast.success(`Checkout recipe saved for ${merchant.name}.`),
      onError: (error) => toast.error(errorMessage(error, "Could not save the recipe.")),
    })
  }

  function requestSave() {
    if (session?.testResult?.passed === false) setConfirm("save-failed")
    else save()
  }

  function cancel() {
    if (!session) return
    cancelSetup.mutate(session.id, {
      onSuccess: () => {
        setIssued(null)
        toast.success(hasWaitingDraft ? "Draft discarded." : "Store setup cancelled.")
      },
      onError: (error) => toast.error(errorMessage(error, "Could not cancel store setup.")),
    })
  }

  return (
    <Card id="store-setup">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <CardTitle className="flex items-center gap-2">
            <WandSparklesIcon className="size-4 text-primary" aria-hidden />
            Set up with extension
          </CardTitle>
          <CardDescription>
            Point and click on the store&apos;s checkout instead of writing selectors. Nothing
            changes for shoppers until you save the result here.
          </CardDescription>
        </div>
        {session && <StateBadge session={session} />}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {isError && (
          <InlineQueryError message="Could not load store setup." onRetry={refetch} />
        )}
        {isLoading && <Skeleton className="h-28 w-full" />}
        {!isLoading && !isError && (
          <SetupBody
            merchant={merchant}
            session={session ?? null}
            issued={issued}
            onIssue={requestNewCode}
            onSave={requestSave}
            onCancel={cancel}
            issuing={issueCode.isPending}
            saving={applySetup.isPending}
            cancelling={cancelSetup.isPending}
          />
        )}
      </CardContent>

      <AlertDialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent>
          {confirm === "replace-draft" ? (
            <AlertDialogHeader>
              <AlertDialogTitle>Discard the waiting draft?</AlertDialogTitle>
              <AlertDialogDescription>
                A new code replaces the draft recipe the extension sent, which hasn&apos;t been
                saved. The store&apos;s current recipe isn&apos;t affected.
              </AlertDialogDescription>
            </AlertDialogHeader>
          ) : (
            <AlertDialogHeader>
              <AlertDialogTitle>Save a recipe that didn&apos;t pass?</AlertDialogTitle>
              <AlertDialogDescription>
                Some checks failed on {merchant.domain}. Shoppers&apos; coupons may not apply
                until the recipe is fixed. Running setup again is usually the better option.
              </AlertDialogDescription>
            </AlertDialogHeader>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Go back</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const action = confirm
                setConfirm(null)
                if (action === "replace-draft") issue()
                else save()
              }}
            >
              {confirm === "replace-draft" ? "Discard and get a new code" : "Save anyway"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}

function StateBadge({ session }: { session: StoreSetupSessionView }) {
  switch (session.state) {
    case "PENDING":
      return <Badge variant="info">Waiting for extension</Badge>
    case "CONNECTED":
      return <Badge variant="info">Extension connected</Badge>
    case "SUBMITTED":
      return session.testResult?.passed === false ? (
        <Badge variant="warning">Needs attention</Badge>
      ) : (
        <Badge variant="success">Ready to save</Badge>
      )
    case "APPLIED":
      return <Badge variant="success">Saved</Badge>
    default:
      return null
  }
}

function SetupBody({
  merchant,
  session,
  issued,
  onIssue,
  onSave,
  onCancel,
  issuing,
  saving,
  cancelling,
}: {
  merchant: Merchant
  session: StoreSetupSessionView | null
  issued: IssuedCode | null
  onIssue: () => void
  onSave: () => void
  onCancel: () => void
  issuing: boolean
  saving: boolean
  cancelling: boolean
}) {
  const newCodeButton = (label: string, variant: "default" | "outline" = "outline") => (
    <Button type="button" variant={variant} onClick={onIssue} disabled={issuing} className="gap-1.5">
      {issuing ? (
        <Loader2Icon className="size-4 animate-spin" aria-hidden />
      ) : (
        <RefreshCwIcon className="size-4" aria-hidden />
      )}
      {issuing ? "Creating code…" : label}
    </Button>
  )
  const cancelButton = (label = "Cancel setup") => (
    <Button type="button" variant="ghost" onClick={onCancel} disabled={cancelling}>
      {cancelling ? "Cancelling…" : label}
    </Button>
  )

  if (session?.state === "PENDING") {
    const code = issued?.sessionId === session.id ? issued.code : null
    if (!code)
      return (
        <div className="flex flex-col items-start gap-3">
          <p className="text-sm text-muted-foreground">
            A setup code was created, but codes are only shown once. Get a new one to continue.
          </p>
          <div className="flex flex-wrap gap-2">
            {newCodeButton("Get a new code", "default")}
            {cancelButton()}
          </div>
        </div>
      )
    return (
      <PendingCode code={code} session={session} newCodeButton={newCodeButton("New code")} cancelButton={cancelButton()} />
    )
  }

  if (session?.state === "CONNECTED")
    return (
      <div className="flex flex-col gap-4">
        <WaitingLine>
          The extension is connected. Follow its steps on {merchant.domain}&apos;s checkout page,
          and the result will appear here.
        </WaitingLine>
        {session.sessionExpiresAt && (
          <p className="text-xs text-muted-foreground">
            The extension&apos;s session ends {relativeTime(session.sessionExpiresAt)}.
          </p>
        )}
        <div>{cancelButton()}</div>
      </div>
    )

  if (session?.state === "SUBMITTED")
    return (
      <SubmittedDraft
        merchant={merchant}
        session={session}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={onSave} disabled={saving}>
              {saving ? "Saving…" : "Save recipe to store"}
            </Button>
            {cancelButton("Discard")}
            {newCodeButton("Run setup again")}
          </div>
        }
      />
    )

  // No session yet, or the last one finished: offer to start.
  return (
    <div className="flex flex-col items-start gap-3">
      {session?.state === "APPLIED" && session.appliedAt && (
        <p className="text-sm text-muted-foreground">
          Last set up with the extension {relativeTime(session.appliedAt)}.
        </p>
      )}
      {session?.state === "EXPIRED" && (
        <p className="text-sm text-muted-foreground">
          The last setup code or session expired before a recipe was sent.
        </p>
      )}
      <p className="text-sm text-muted-foreground">
        {merchant.checkoutRecipe
          ? "Run setup again to replace this store's current recipe. It stays as it is until you save a new one."
          : "This store has no checkout recipe yet. You'll need a computer with the Saverlly extension and an item in the store's cart."}
      </p>
      {newCodeButton(session?.state === "APPLIED" ? "Run setup again" : "Get setup code", "default")}
    </div>
  )
}

function PendingCode({
  code,
  session,
  newCodeButton,
  cancelButton,
}: {
  code: string
  session: StoreSetupSessionView
  newCodeButton: React.ReactNode
  cancelButton: React.ReactNode
}) {
  const now = useNow(1000)
  const remaining = Date.parse(session.codeExpiresAt) - now

  async function copy() {
    try {
      await navigator.clipboard.writeText(code)
      toast.success("Setup code copied.")
    } catch {
      toast.error("Could not copy to clipboard.")
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-black/8 px-4 py-3 dark:border-white/10">
        <code
          className="font-mono text-2xl font-semibold tracking-[0.12em]"
          aria-label={`Setup code ${code.split("").join(" ")}`}
        >
          {code}
        </code>
        <Button type="button" variant="ghost" size="icon-sm" onClick={copy} aria-label="Copy setup code">
          <CopyIcon className="size-3.5" />
        </Button>
        <span className="ml-auto text-sm text-muted-foreground tabular-nums" aria-live="off">
          {remaining > 0 ? `Expires in ${formatCountdown(remaining)}` : "Expired"}
        </span>
      </div>
      <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-sm">
        <li>
          On the computer you&apos;ll use, right-click the Saverlly icon in Chrome&apos;s toolbar
          and choose <strong>Options</strong>.
        </li>
        <li>Enter this code. It works once and expires after 10 minutes.</li>
        <li>Open the store&apos;s checkout page with an item in the cart.</li>
      </ol>
      <WaitingLine>Waiting for the extension…</WaitingLine>
      <div className="flex flex-wrap gap-2">
        {newCodeButton}
        {cancelButton}
      </div>
    </div>
  )
}

function WaitingLine({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-2 text-sm" role="status">
      <Loader2Icon className="size-4 shrink-0 animate-spin text-primary" aria-hidden />
      <span>{children}</span>
    </p>
  )
}

function SubmittedDraft({
  merchant,
  session,
  actions,
}: {
  merchant: Merchant
  session: StoreSetupSessionView
  actions: React.ReactNode
}) {
  const result = session.testResult
  const checks = result
    ? [...result.checks].sort((a, b) => CHECK_ORDER.indexOf(a.key) - CHECK_ORDER.indexOf(b.key))
    : []

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">
          {result?.passed === false
            ? "The extension found problems on the checkout."
            : "The extension tested this recipe on the checkout."}
        </p>
        <p className="text-xs text-muted-foreground">
          {session.submittedAt && <>Sent {relativeTime(session.submittedAt)}. </>}
          {session.extensionActive && "The extension can still send an updated version."}
        </p>
      </div>

      {checks.length > 0 && (
        <ul className="flex flex-col divide-y divide-black/6 rounded-lg border border-black/8 dark:divide-white/10 dark:border-white/10" aria-label="Test result">
          {checks.map((check) => (
            <CheckRow key={check.key} check={check} />
          ))}
        </ul>
      )}
      {result?.cartTotal !== undefined && (
        <p className="text-sm text-muted-foreground">
          Order total read from the page: {" "}
          <span className="font-medium text-foreground tabular-nums">
            {totalFormatter.format(result.cartTotal)}
          </span>
        </p>
      )}

      {session.draftRecipe && (
        <details className="group rounded-lg border border-black/8 px-4 py-3 text-sm dark:border-white/10">
          <summary className="cursor-pointer font-medium text-muted-foreground group-open:text-foreground">
            Technical details
          </summary>
          <dl className="mt-3 grid grid-cols-[max-content_minmax(0,1fr)] gap-x-4 gap-y-1.5">
            <RecipeRow label="Checkout pages" value={session.draftRecipe.checkoutUrlPatterns.join(", ")} />
            <RecipeRow label="Promo code link" value={session.draftRecipe.couponFieldRevealSelector} />
            <RecipeRow label="Promo code box" value={session.draftRecipe.couponFieldSelector} />
            <RecipeRow label="Apply button" value={session.draftRecipe.applyButtonSelector} />
            <RecipeRow label="Order total" value={session.draftRecipe.cartTotalSelector} />
            <RecipeRow label="Rejected message" value={session.draftRecipe.failureIndicatorSelector} />
            <RecipeRow label="Accepted message" value={session.draftRecipe.successIndicatorSelector} />
            <RecipeRow label="Remove code" value={session.draftRecipe.removeCouponSelector} />
            <RecipeRow
              label="Apply mode"
              value={
                session.draftRecipe.couponApplyMode === "remove"
                  ? "Remove each code before the next"
                  : session.draftRecipe.couponApplyMode === "replace"
                    ? "A new code replaces the previous one"
                    : undefined
              }
            />
          </dl>
        </details>
      )}

      {merchant.checkoutRecipe && (
        <p className="text-xs text-muted-foreground">
          Saving replaces this store&apos;s current checkout recipe.
        </p>
      )}
      {actions}
    </div>
  )
}

function CheckRow({ check }: { check: StoreSetupCheck }) {
  const icon =
    check.outcome === "pass" ? (
      <CheckCircle2Icon className="size-4 shrink-0 text-[var(--success-foreground)]" aria-hidden />
    ) : check.outcome === "fail" ? (
      <XCircleIcon className="size-4 shrink-0 text-destructive" aria-hidden />
    ) : (
      <CircleMinusIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
    )
  const outcome = check.outcome === "pass" ? "Passed" : check.outcome === "fail" ? "Failed" : "Skipped"
  return (
    <li className="flex items-start gap-3 px-4 py-2.5 text-sm">
      <span className="mt-0.5">{icon}</span>
      <span className="flex min-w-0 flex-col">
        <span className="font-medium">
          {CHECK_LABELS[check.key]}
          <span className="sr-only">: {outcome}</span>
        </span>
        {check.detail && <span className="text-muted-foreground">{check.detail}</span>}
      </span>
    </li>
  )
}

function RecipeRow({ label, value }: { label: string; value: string | undefined }) {
  if (!value) return null
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-mono text-xs break-all">{value}</dd>
    </>
  )
}
