"use client"

import { InlineQueryError } from "@/components/dashboard/query-state"

import * as React from "react"
import { toast } from "sonner"
import { CreditCardIcon, ClockIcon, CircleCheckIcon } from "lucide-react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { BentoGrid } from "@/components/dashboard/bento-grid"
import { StatTile } from "@/components/dashboard/stat-tile"
import { TablePagination } from "@/components/dashboard/table-pagination"
import { usePayouts, useProcessPayout } from "@/lib/api/hooks/use-payouts"
import { ApiError } from "@/lib/api/client"
import { formatCurrency } from "@/lib/format-currency"
import { PAYOUT_STATUS_BADGE_VARIANT, PAYOUT_STATUS_LABEL } from "@/lib/dashboard/status-labels"
import { monthOverMonthGrowth } from "@/lib/dashboard/aggregate"
import { useCollectionView } from "@/hooks/use-collection-view"
import { CollectionToolbar } from "@/components/dashboard/collection-toolbar"
import { usePagination } from "@/hooks/use-pagination"
import type { Payout } from "@/lib/api/types"

export default function AdminPayoutsPage() {
  const { data: payouts, isLoading, isError, refetch } = usePayouts()
  const view = useCollectionView(payouts, {
    searchText: (item) => item.kiosk?.name ?? "Unassigned",
    sorts: [
      {
        label: "Newest first",
        value: "newest",
        compare: (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      },
      {
        label: "Amount: highest",
        value: "amount",
        compare: (a, b) => b.totalAmount - a.totalAmount,
      },
    ],
    filters: ["PENDING", "PROCESSING", "PAID", "FAILED"].map((status) => ({
      label: PAYOUT_STATUS_LABEL[status as Payout["status"]],
      value: status,
      matches: (item: Payout) => item.status === status,
    })),
  })
  const { page, setPage, pageCount, pageItems, totalItems, pageSize } = usePagination(
    view.items,
    undefined,
    view.resetKey,
  )

  const stats = React.useMemo(() => {
    const list = payouts ?? []
    const pending = list.filter((p) => p.status === "PENDING")
    const paid = list.filter((p) => p.status === "PAID")
    return {
      total: list.length,
      pendingAmount: pending.reduce((sum, p) => sum + p.totalAmount, 0),
      paidAmount: paid.reduce((sum, p) => sum + p.totalAmount, 0),
    }
  }, [payouts])

  const totalGrowth = React.useMemo(
    () =>
      monthOverMonthGrowth(
        payouts ?? [],
        (p) => p.createdAt,
        () => 1,
      ),
    [payouts],
  )
  const paidGrowth = React.useMemo(
    () =>
      monthOverMonthGrowth(
        (payouts ?? []).filter((p) => p.status === "PAID"),
        (p) => p.paidAt,
        (p) => p.totalAmount,
      ),
    [payouts],
  )

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-title">Payouts</h1>
        <p className="text-sm text-muted-foreground">
          Review pending payouts and trigger the real Stripe transfer when ready.
        </p>
      </div>

      <BentoGrid>
        <StatTile
          isLoading={isLoading}
          isError={isError}
          label="Total payouts"
          value={stats.total}
          icon={<CreditCardIcon />}
          delta={totalGrowth}
          subtext={totalGrowth !== null ? "vs last month" : undefined}
        />
        <StatTile
          isLoading={isLoading}
          isError={isError}
          label="Awaiting processing"
          value={stats.pendingAmount}
          format={formatCurrency}
          icon={<ClockIcon />}
        />
        <StatTile
          isLoading={isLoading}
          isError={isError}
          label="Paid"
          value={stats.paidAmount}
          format={formatCurrency}
          icon={<CircleCheckIcon />}
          delta={paidGrowth}
          subtext={paidGrowth !== null ? "vs last month" : undefined}
        />
      </BentoGrid>

      <CollectionToolbar view={view} label="Payouts" />

      {isError && <InlineQueryError message="Could not load payouts." onRetry={refetch} />}

      <div className="flex flex-col gap-2">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Kiosk</TableHead>
              <TableHead>Period</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Stripe</TableHead>
              <TableHead className="w-32" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={6}>
                    <Skeleton className="h-6 w-full" />
                  </TableCell>
                </TableRow>
              ))}

            {!isLoading && !isError && view.items.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  {view.hasFilters ? "No payouts match these filters." : "No payouts yet."}
                </TableCell>
              </TableRow>
            )}

            {pageItems.map((payout, index) => (
              <PayoutRow key={payout.id} payout={payout} index={index} />
            ))}
          </TableBody>
        </Table>
        <TablePagination
          page={page}
          pageCount={pageCount}
          totalItems={totalItems}
          pageSize={pageSize}
          onPageChange={setPage}
        />
      </div>
    </div>
  )
}

function PayoutRow({ payout, index }: { payout: Payout; index: number }) {
  const processPayout = useProcessPayout()
  const [confirmOpen, setConfirmOpen] = React.useState(false)
  const [processError, setProcessError] = React.useState<string | null>(null)

  function handleProcess() {
    setProcessError(null)
    processPayout.mutate(payout.id, {
      onSuccess: () => {
        toast.success("Payout is now processing.")
        setConfirmOpen(false)
      },
      onError: (error) =>
        setProcessError(error instanceof ApiError ? error.message : "Could not process payout."),
    })
  }

  const stripeConnected = payout.kiosk?.stripeConnected ?? false

  return (
    <TableRow index={index}>
      <TableCell className="font-medium">{payout.kiosk?.name ?? "Unassigned"}</TableCell>
      <TableCell>
        {new Date(payout.periodStart).toLocaleDateString()} -{" "}
        {new Date(payout.periodEnd).toLocaleDateString()}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {formatCurrency(payout.totalAmount)}
      </TableCell>
      <TableCell>
        <Badge variant={PAYOUT_STATUS_BADGE_VARIANT[payout.status]}>
          {PAYOUT_STATUS_LABEL[payout.status]}
        </Badge>
      </TableCell>
      <TableCell>
        <Badge variant={stripeConnected ? "success" : "secondary"}>
          {stripeConnected ? "Connected" : "Not connected"}
        </Badge>
      </TableCell>
      <TableCell>
        {payout.status === "PENDING" && (
          <AlertDialog
            open={confirmOpen}
            onOpenChange={(open) => {
              if (!processPayout.isPending) {
                setConfirmOpen(open)
                setProcessError(null)
              }
            }}
          >
            <AlertDialogTrigger asChild>
              <Button
                type="button"
                size="sm"
                disabled={!stripeConnected || processPayout.isPending}
              >
                Process
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Process this payout?</AlertDialogTitle>
                <AlertDialogDescription>
                  This triggers a real Stripe transfer of {formatCurrency(payout.totalAmount)} to{" "}
                  {payout.kiosk?.name ?? "this kiosk"}. This can&apos;t be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              {processError && (
                <div className="px-6">
                  <InlineQueryError message={processError} />
                </div>
              )}
              <AlertDialogFooter>
                <AlertDialogCancel disabled={processPayout.isPending}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  disabled={processPayout.isPending}
                  onClick={(event) => {
                    event.preventDefault()
                    handleProcess()
                  }}
                >
                  {processPayout.isPending ? "Processing…" : "Process"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </TableCell>
    </TableRow>
  )
}
