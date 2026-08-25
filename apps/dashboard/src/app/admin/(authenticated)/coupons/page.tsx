"use client"

import * as React from "react"
import Link from "next/link"
import { toast } from "sonner"
import { TagIcon, PercentIcon, Trash2Icon } from "lucide-react"
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
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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
import { BentoGrid } from "@/components/dashboard/bento-grid"
import { StatTile } from "@/components/dashboard/stat-tile"
import { TablePagination } from "@/components/dashboard/table-pagination"
import { TableSelectionToolbar } from "@/components/dashboard/table-selection-toolbar"
import { useCoupons, useDeleteCoupon } from "@/lib/api/hooks/use-coupons"
import { useMerchants } from "@/lib/api/hooks/use-merchants"
import { ApiError } from "@/lib/api/client"
import { usePagination } from "@/hooks/use-pagination"
import { useTableSelection } from "@/hooks/use-table-selection"
import { monthOverMonthGrowth } from "@/lib/dashboard/aggregate"
import { CouponDialog } from "./coupon-dialog"

const ALL_MERCHANTS = "all"

export default function CouponsPage() {
  const [merchantFilter, setMerchantFilter] = React.useState(ALL_MERCHANTS)
  const { data: merchants } = useMerchants()
  const { data: allCoupons, isLoading, isError } = useCoupons()
  const deleteCoupon = useDeleteCoupon()
  const [bulkDeleting, setBulkDeleting] = React.useState(false)

  const filteredCoupons = React.useMemo(
    () =>
      merchantFilter === ALL_MERCHANTS
        ? (allCoupons ?? [])
        : (allCoupons ?? []).filter((c) => c.merchantId === merchantFilter),
    [allCoupons, merchantFilter],
  )
  const { page, setPage, pageCount, pageItems: coupons, totalItems, pageSize } =
    usePagination(filteredCoupons)
  const selection = useTableSelection(coupons, (c) => c.id)

  const merchantNameById = React.useMemo(() => {
    const map = new Map<string, string>()
    for (const merchant of merchants ?? []) map.set(merchant.id, merchant.name)
    return map
  }, [merchants])

  const totalGrowth = React.useMemo(
    () => monthOverMonthGrowth(filteredCoupons, (c) => c.createdAt, () => 1),
    [filteredCoupons],
  )

  const stats = React.useMemo(() => {
    const success = filteredCoupons.reduce((sum, c) => sum + c.successCount, 0)
    const fail = filteredCoupons.reduce((sum, c) => sum + c.failCount, 0)
    const attempts = success + fail
    return { total: filteredCoupons.length, rate: attempts > 0 ? (success / attempts) * 100 : 0 }
  }, [filteredCoupons])

  function handleDelete(id: string, code: string) {
    deleteCoupon.mutate(id, {
      onSuccess: () => toast.success(`${code} was deleted.`),
      onError: (error) =>
        toast.error(error instanceof ApiError ? error.message : "Could not delete coupon."),
    })
  }

  async function handleBulkDelete() {
    const ids = Array.from(selection.selectedIds)
    setBulkDeleting(true)
    const results = await Promise.allSettled(ids.map((id) => deleteCoupon.mutateAsync(id)))
    setBulkDeleting(false)
    const succeededIds = ids.filter((_, i) => results[i].status === "fulfilled")
    const failed = ids.length - succeededIds.length
    if (failed === 0) {
      toast.success(`${ids.length} coupon${ids.length === 1 ? "" : "s"} deleted.`)
    } else {
      toast.error(`${failed} of ${ids.length} coupons could not be deleted.`)
    }
    selection.deselectMany(succeededIds)
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Coupons</h2>
          <p className="text-sm text-muted-foreground">
            Every coupon code across every merchant, and how well it&apos;s converting.
          </p>
        </div>
        <CouponDialog merchants={merchants} />
      </div>

      <BentoGrid>
        <StatTile
          label="Coupons"
          value={stats.total}
          icon={<TagIcon />}
          delta={totalGrowth}
          subtext={totalGrowth !== null ? "vs last month" : undefined}
        />
        <StatTile
          label="Success rate"
          value={stats.rate}
          icon={<PercentIcon />}
          format={(n) => `${n.toFixed(1)}%`}
        />
      </BentoGrid>

      <div className="flex items-center gap-2">
        <Select value={merchantFilter} onValueChange={setMerchantFilter}>
          <SelectTrigger className="w-64">
            <SelectValue placeholder="All merchants" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_MERCHANTS}>All merchants</SelectItem>
            {merchants?.map((merchant) => (
              <SelectItem key={merchant.id} value={merchant.id}>
                {merchant.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isError && <p className="text-sm text-destructive">Could not load coupons.</p>}

      <div className="flex flex-col gap-2">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={selection.allSelected ? true : selection.someSelected ? "indeterminate" : false}
                  onCheckedChange={selection.toggleAll}
                  aria-label="Select all coupons on this page"
                />
              </TableHead>
              <TableHead>Merchant</TableHead>
              <TableHead>Code</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Success / Fail</TableHead>
              <TableHead>Active</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={7}>
                    <Skeleton className="h-6 w-full" />
                  </TableCell>
                </TableRow>
              ))}

            {!isLoading && coupons.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  No coupons yet.
                </TableCell>
              </TableRow>
            )}

            {coupons.map((coupon, index) => (
              <TableRow key={coupon.id} index={index} data-state={selection.isSelected(coupon.id) ? "selected" : undefined}>
                <TableCell className="w-10">
                  <Checkbox
                    checked={selection.isSelected(coupon.id)}
                    onCheckedChange={() => selection.toggle(coupon.id)}
                    aria-label={`Select ${coupon.code}`}
                  />
                </TableCell>
                <TableCell className="font-medium">
                  <Link href={`/admin/merchants/${coupon.merchantId}`} className="hover:underline">
                    {merchantNameById.get(coupon.merchantId) ?? "Unknown merchant"}
                  </Link>
                </TableCell>
                <TableCell>{coupon.code}</TableCell>
                <TableCell>
                  <Badge variant="outline">{coupon.source}</Badge>
                </TableCell>
                <TableCell>
                  {coupon.successCount} / {coupon.failCount}
                </TableCell>
                <TableCell>
                  <Badge variant={coupon.active ? "success" : "secondary"}>
                    {coupon.active ? "Active" : "Inactive"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <TableRowActions>
                    <CouponDialog merchantId={coupon.merchantId} coupon={coupon} />
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          className="text-destructive"
                          aria-label={`Delete ${coupon.code}`}
                        >
                          <Trash2Icon className="size-3.5" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete {coupon.code}?</AlertDialogTitle>
                          <AlertDialogDescription>This can&apos;t be undone.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleDelete(coupon.id, coupon.code)}
                            className="bg-destructive text-white hover:bg-destructive/90"
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
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

      <TableSelectionToolbar count={selection.selectedCount} onClear={selection.clear}>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <button
              type="button"
              disabled={bulkDeleting}
              className="flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium text-white transition-colors hover:bg-white/10 disabled:opacity-50"
            >
              <Trash2Icon className="size-3.5" />
              {bulkDeleting ? "Deleting…" : "Delete"}
            </button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete {selection.selectedCount} coupons?</AlertDialogTitle>
              <AlertDialogDescription>This can&apos;t be undone.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleBulkDelete}
                className="bg-destructive text-white hover:bg-destructive/90"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </TableSelectionToolbar>
    </div>
  )
}
