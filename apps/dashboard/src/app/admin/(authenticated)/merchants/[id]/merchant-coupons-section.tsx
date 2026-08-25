"use client"

import * as React from "react"
import { toast } from "sonner"
import { Trash2Icon } from "lucide-react"
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
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
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
import { useCoupons, useDeleteCoupon } from "@/lib/api/hooks/use-coupons"
import { ApiError } from "@/lib/api/client"
import { usePagination } from "@/hooks/use-pagination"
import { CouponDialog } from "../../coupons/coupon-dialog"

export function MerchantCouponsSection({ merchantId }: { merchantId: string }) {
  const { data: allCoupons, isLoading, isError } = useCoupons()
  const deleteCoupon = useDeleteCoupon()

  const merchantCoupons = React.useMemo(
    () => (allCoupons ?? []).filter((c) => c.merchantId === merchantId),
    [allCoupons, merchantId],
  )
  const { page, setPage, pageCount, pageItems: coupons, totalItems, pageSize } =
    usePagination(merchantCoupons)

  function handleDelete(id: string, code: string) {
    deleteCoupon.mutate(id, {
      onSuccess: () => toast.success(`${code} was deleted.`),
      onError: (error) =>
        toast.error(error instanceof ApiError ? error.message : "Could not delete coupon."),
    })
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Coupons</CardTitle>
        <CouponDialog merchantId={merchantId} />
      </CardHeader>
      <CardContent>
        {isError && <p className="text-sm text-destructive">Could not load coupons.</p>}

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Success / Fail</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 2 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={4}>
                    <Skeleton className="h-6 w-full" />
                  </TableCell>
                </TableRow>
              ))}

            {!isLoading && coupons.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  No coupons yet.
                </TableCell>
              </TableRow>
            )}

            {coupons.map((coupon, index) => (
              <TableRow key={coupon.id} index={index}>
                <TableCell className="font-medium">{coupon.code}</TableCell>
                <TableCell>
                  <Badge variant="outline">{coupon.source}</Badge>
                </TableCell>
                <TableCell>
                  {coupon.successCount} / {coupon.failCount}
                </TableCell>
                <TableCell>
                  <TableRowActions>
                    <CouponDialog merchantId={merchantId} coupon={coupon} />
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
                          <AlertDialogDescription>
                            This can&apos;t be undone.
                          </AlertDialogDescription>
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
      </CardContent>
    </Card>
  )
}
