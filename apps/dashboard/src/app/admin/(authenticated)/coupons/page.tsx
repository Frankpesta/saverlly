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
} from "@/components/ui/table"
import { BentoGrid } from "@/components/dashboard/bento-grid"
import { StatTile } from "@/components/dashboard/stat-tile"
import { TablePagination } from "@/components/dashboard/table-pagination"
import { useCoupons, useDeleteCoupon } from "@/lib/api/hooks/use-coupons"
import { useMerchants } from "@/lib/api/hooks/use-merchants"
import { ApiError } from "@/lib/api/client"
import { usePagination } from "@/hooks/use-pagination"
import { CouponDialog } from "./coupon-dialog"

const ALL_MERCHANTS = "all"

export default function CouponsPage() {
  const [merchantFilter, setMerchantFilter] = React.useState(ALL_MERCHANTS)
  const { data: merchants } = useMerchants()
  const { data: allCoupons, isLoading, isError } = useCoupons()
  const deleteCoupon = useDeleteCoupon()

  const filteredCoupons = React.useMemo(
    () =>
      merchantFilter === ALL_MERCHANTS
        ? (allCoupons ?? [])
        : (allCoupons ?? []).filter((c) => c.merchantId === merchantFilter),
    [allCoupons, merchantFilter],
  )
  const { page, setPage, pageCount, pageItems: coupons, totalItems, pageSize } =
    usePagination(filteredCoupons)

  const merchantNameById = React.useMemo(() => {
    const map = new Map<string, string>()
    for (const merchant of merchants ?? []) map.set(merchant.id, merchant.name)
    return map
  }, [merchants])

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
        <StatTile label="Coupons" value={stats.total} icon={<TagIcon />} />
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

      <div className="overflow-hidden rounded-2xl border border-black/8">
        <Table>
          <TableHeader>
            <TableRow>
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
                  <TableCell colSpan={6}>
                    <Skeleton className="h-6 w-full" />
                  </TableCell>
                </TableRow>
              ))}

            {!isLoading && coupons.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  No coupons yet.
                </TableCell>
              </TableRow>
            )}

            {coupons.map((coupon) => (
              <TableRow key={coupon.id}>
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
                  <Badge variant={coupon.active ? "default" : "secondary"}>
                    {coupon.active ? "Active" : "Inactive"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-3">
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
                  </div>
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
    </div>
  )
}
