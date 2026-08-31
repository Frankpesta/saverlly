"use client"

import * as React from "react"
import { toast } from "sonner"
import { WalletIcon, ClockIcon, TrendingUpIcon, CreditCardIcon, ExternalLinkIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
import { usePagination } from "@/hooks/use-pagination"
import { useCurrentUser } from "@/lib/api/hooks/use-current-user"
import { useKiosk } from "@/lib/api/hooks/use-kiosks"
import { useMyBalance, useMyCommissionEvents } from "@/lib/api/hooks/use-commissions"
import { useMyPayouts, useStripeOnboard } from "@/lib/api/hooks/use-payouts"
import { useDevices } from "@/lib/api/hooks/use-devices"
import { ApiError } from "@/lib/api/client"
import { formatCurrency } from "@/lib/format-currency"
import {
  COMMISSION_STATUS_BADGE_VARIANT,
  COMMISSION_STATUS_LABEL,
  PAYOUT_STATUS_BADGE_VARIANT,
  PAYOUT_STATUS_LABEL,
} from "@/lib/dashboard/status-labels"
import { bucketByDay, monthOverMonthGrowth } from "@/lib/dashboard/aggregate"

export default function PortalEarningsPage() {
  const { data: currentUser } = useCurrentUser()
  const kioskId = currentUser?.kioskId ?? ""
  const { data: kiosk } = useKiosk(kioskId)
  const { data: balance } = useMyBalance()
  const { data: events, isLoading: eventsLoading } = useMyCommissionEvents()
  const { data: payouts, isLoading: payoutsLoading } = useMyPayouts()
  const { data: devices } = useDevices()
  const stripeOnboard = useStripeOnboard()

  const confirmedEvents = React.useMemo(
    () => (events ?? []).filter((e) => e.status === "CONFIRMED"),
    [events],
  )
  const totalEarnings = React.useMemo(
    () => confirmedEvents.reduce((sum, e) => sum + e.kioskShareAmount, 0),
    [confirmedEvents],
  )
  const earningsGrowth = React.useMemo(
    () => monthOverMonthGrowth(confirmedEvents, (e) => e.confirmedAt ?? e.reportedAt, (e) => e.kioskShareAmount),
    [confirmedEvents],
  )
  const earningsTrend = React.useMemo(
    () =>
      bucketByDay(
        confirmedEvents,
        (event) => event.confirmedAt ?? event.reportedAt,
        (event) => event.kioskShareAmount,
        14,
      ).map((point) => point.value),
    [confirmedEvents],
  )
  const paidPayouts = React.useMemo(() => (payouts ?? []).filter((p) => p.status === "paid"), [payouts])
  const totalPaidOut = React.useMemo(
    () => paidPayouts.reduce((sum, p) => sum + p.totalAmount, 0),
    [paidPayouts],
  )

  const deviceLabelById = React.useMemo(() => {
    const map = new Map<string, string>()
    for (const d of devices ?? []) map.set(d.id, d.label)
    return map
  }, [devices])

  const recentEvents = React.useMemo(
    () => [...(events ?? [])].sort((a, b) => new Date(b.reportedAt).getTime() - new Date(a.reportedAt).getTime()),
    [events],
  )
  const recentPayouts = React.useMemo(
    () => [...(payouts ?? [])].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [payouts],
  )

  const eventsPagination = usePagination(recentEvents)
  const payoutsPagination = usePagination(recentPayouts)

  function handleConnectStripe() {
    stripeOnboard.mutate(undefined, {
      onSuccess: (data) => {
        window.location.href = data.url
      },
      onError: (error) =>
        toast.error(error instanceof ApiError ? error.message : "Could not start onboarding."),
    })
  }

  const stripeAccountId = kiosk?.stripeAccountId
  const stripePayoutsEnabled = kiosk?.stripePayoutsEnabled ?? false

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Earnings</h2>
        <p className="text-sm text-muted-foreground">
          Your balance, payout history, and account connection.
        </p>
      </div>

      <BentoGrid>
        <StatTile
          label="Available balance"
          value={balance?.confirmedAvailableAmount ?? 0}
          format={formatCurrency}
          icon={<WalletIcon />}
        />
        <StatTile
          label="Pending balance"
          value={balance?.pendingAmount ?? 0}
          format={formatCurrency}
          icon={<ClockIcon />}
          subtext="Awaiting confirmation"
        />
        <StatTile
          label="Total earnings"
          value={totalEarnings}
          format={formatCurrency}
          icon={<TrendingUpIcon />}
          delta={earningsGrowth}
          trend={earningsTrend}
          subtext="Lifetime"
        />
        <StatTile
          label="Total paid out"
          value={totalPaidOut}
          format={formatCurrency}
          icon={<CreditCardIcon />}
          subtext={`${paidPayouts.length} payout${paidPayouts.length === 1 ? "" : "s"}`}
        />
      </BentoGrid>

      <Card className="border border-black/6 dark:border-white/10 shadow-[0_8px_24px_rgba(11,11,11,0.04)]">
        <CardHeader>
          <CardTitle>Payouts</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col gap-1">
              <Badge variant={stripePayoutsEnabled ? "success" : "secondary"} className="w-fit">
                {stripePayoutsEnabled
                  ? "Payouts enabled"
                  : stripeAccountId
                    ? "Onboarding incomplete"
                    : "Not connected"}
              </Badge>
              <p className="text-sm text-muted-foreground">
                {stripePayoutsEnabled
                  ? "Your account is connected and ready to receive payouts."
                  : "Connect your account so payouts can be sent to you."}
              </p>
            </div>
            {!stripePayoutsEnabled && (
              <Button className="gap-1.5" onClick={handleConnectStripe} disabled={stripeOnboard.isPending}>
                <ExternalLinkIcon className="size-4" />
                {stripeOnboard.isPending
                  ? "Redirecting…"
                  : stripeAccountId
                    ? "Continue onboarding"
                    : "Connect Account"}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="border border-black/6 dark:border-white/10 shadow-[0_8px_24px_rgba(11,11,11,0.04)]">
        <CardHeader>
          <CardTitle>Commission history</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Device</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Reported</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {eventsLoading &&
                Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={4}>
                      <Skeleton className="h-6 w-full" />
                    </TableCell>
                  </TableRow>
                ))}

              {!eventsLoading && recentEvents.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    No commission activity yet.
                  </TableCell>
                </TableRow>
              )}

              {eventsPagination.pageItems.map((event, index) => (
                <TableRow key={event.id} index={index}>
                  <TableCell className="font-medium">
                    {deviceLabelById.get(event.deviceId) ?? "Unknown device"}
                  </TableCell>
                  <TableCell>{formatCurrency(event.commissionAmount)}</TableCell>
                  <TableCell>
                    <Badge variant={COMMISSION_STATUS_BADGE_VARIANT[event.status]}>
                      {COMMISSION_STATUS_LABEL[event.status]}
                    </Badge>
                  </TableCell>
                  <TableCell>{new Date(event.reportedAt).toLocaleDateString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <TablePagination
            page={eventsPagination.page}
            pageCount={eventsPagination.pageCount}
            totalItems={eventsPagination.totalItems}
            pageSize={eventsPagination.pageSize}
            onPageChange={eventsPagination.setPage}
          />
        </CardContent>
      </Card>

      <Card className="border border-black/6 dark:border-white/10 shadow-[0_8px_24px_rgba(11,11,11,0.04)]">
        <CardHeader>
          <CardTitle>Payout history</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Period</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Paid</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payoutsLoading &&
                Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={4}>
                      <Skeleton className="h-6 w-full" />
                    </TableCell>
                  </TableRow>
                ))}

              {!payoutsLoading && recentPayouts.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    No payouts yet.
                  </TableCell>
                </TableRow>
              )}

              {payoutsPagination.pageItems.map((payout, index) => (
                <TableRow key={payout.id} index={index}>
                  <TableCell>
                    {new Date(payout.periodStart).toLocaleDateString()} –{" "}
                    {new Date(payout.periodEnd).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="font-medium">{formatCurrency(payout.totalAmount)}</TableCell>
                  <TableCell>
                    <Badge variant={PAYOUT_STATUS_BADGE_VARIANT[payout.status]}>
                      {PAYOUT_STATUS_LABEL[payout.status]}
                    </Badge>
                  </TableCell>
                  <TableCell>{payout.paidAt ? new Date(payout.paidAt).toLocaleDateString() : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <TablePagination
            page={payoutsPagination.page}
            pageCount={payoutsPagination.pageCount}
            totalItems={payoutsPagination.totalItems}
            pageSize={payoutsPagination.pageSize}
            onPageChange={payoutsPagination.setPage}
          />
        </CardContent>
      </Card>
    </div>
  )
}
