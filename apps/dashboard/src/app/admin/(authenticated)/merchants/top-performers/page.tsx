"use client"

import * as React from "react"
import Link from "next/link"
import { ArrowLeftIcon, ArrowUpRightIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableRowActions,
} from "@/components/ui/table"
import { TablePagination } from "@/components/dashboard/table-pagination"
import { CollectionArea, CollectionSummary, WorkspaceHeader } from "@/components/dashboard/page-layout"
import { useMerchants } from "@/lib/api/hooks/use-merchants"
import { useCoupons } from "@/lib/api/hooks/use-coupons"
import { useCommissionEvents } from "@/lib/api/hooks/use-commissions"
import { formatCurrency } from "@/lib/format-currency"
import { usePagination } from "@/hooks/use-pagination"
import { topByGroup } from "@/lib/dashboard/aggregate"

export default function TopPerformingMerchantsPage() {
  const { data: merchants, isLoading: merchantsLoading } = useMerchants()
  const { data: coupons } = useCoupons()
  const { data: events, isLoading: eventsLoading } = useCommissionEvents()

  const confirmedEvents = React.useMemo(
    () => (events ?? []).filter((e) => e.status === "CONFIRMED"),
    [events],
  )

  const merchantById = React.useMemo(() => {
    return new Map((merchants ?? []).map((m) => [m.id, m]))
  }, [merchants])

  const couponStatsByMerchant = React.useMemo(() => {
    const map = new Map<string, { success: number; fail: number }>()
    for (const coupon of coupons ?? []) {
      const entry = map.get(coupon.merchantId) ?? { success: 0, fail: 0 }
      entry.success += coupon.successCount
      entry.fail += coupon.failCount
      map.set(coupon.merchantId, entry)
    }
    return map
  }, [coupons])

  const ranked = React.useMemo(() => {
    return topByGroup(confirmedEvents, (e) => e.merchantId, (e) => e.commissionAmount, Infinity)
      .filter((row) => merchantById.has(row.key))
      .map((row) => {
        const stats = couponStatsByMerchant.get(row.key)
        const attempts = (stats?.success ?? 0) + (stats?.fail ?? 0)
        const successRate = attempts > 0 ? (stats!.success / attempts) * 100 : null
        return { ...row, merchant: merchantById.get(row.key)!, successRate }
      })
  }, [confirmedEvents, merchantById, couponStatsByMerchant])

  const { page, setPage, pageCount, pageItems, totalItems, pageSize } = usePagination(ranked)

  const isLoading = merchantsLoading || eventsLoading
  const totalCommission = ranked.reduce((sum, row) => sum + row.total, 0)

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/admin/overview"
        className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeftIcon className="size-4" />
        Overview
      </Link>

      <WorkspaceHeader
        title="Top merchants"
        description="Ranked by confirmed commission, highest first."
      />

      <CollectionSummary
        items={[
          { label: "Ranked merchants", value: ranked.length, detail: "With confirmed commissions" },
          { label: "Total commission", value: formatCurrency(totalCommission), detail: "Confirmed, all-time" },
        ]}
      />

      <CollectionArea title="Merchants" titleHidden count={totalItems}>
        <div className="flex flex-col gap-2">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">#</TableHead>
                <TableHead>Merchant</TableHead>
                <TableHead>Coupon success</TableHead>
                <TableHead className="text-right">Commission</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading &&
                Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={5}>
                      <Skeleton className="h-6 w-full" />
                    </TableCell>
                  </TableRow>
                ))}
              {!isLoading && ranked.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    No confirmed commissions yet.
                  </TableCell>
                </TableRow>
              )}
              {pageItems.map((row, i) => (
                <TableRow key={row.key} index={i}>
                  <TableCell className="text-muted-foreground">
                    {(page - 1) * pageSize + i + 1}
                  </TableCell>
                  <TableCell className="font-medium">{row.merchant.name}</TableCell>
                  <TableCell>
                    {row.successRate !== null ? (
                      <Badge variant={row.successRate >= 50 ? "success" : "warning"}>
                        {row.successRate.toFixed(0)}% coupons
                      </Badge>
                    ) : (
                      <span className="text-sm text-muted-foreground">No data</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-medium">{formatCurrency(row.total)}</TableCell>
                  <TableCell>
                    <TableRowActions>
                      <Link
                        href={`/admin/merchants/${row.key}`}
                        className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
                        aria-label={`View ${row.merchant.name}`}
                      >
                        <ArrowUpRightIcon className="size-3.5" />
                      </Link>
                    </TableRowActions>
                  </TableCell>
                </TableRow>
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
      </CollectionArea>
    </div>
  )
}
