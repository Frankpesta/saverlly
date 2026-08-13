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
} from "@/components/ui/table"
import { useCouponsPage, useDeleteCoupon } from "@/lib/api/hooks/use-coupons"
import { ApiError } from "@/lib/api/client"
import { CouponDialog } from "../../coupons/coupon-dialog"

export function MerchantCouponsSection({ merchantId }: { merchantId: string }) {
  const { data, isLoading, isError, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useCouponsPage(merchantId)
  const deleteCoupon = useDeleteCoupon()

  const coupons = React.useMemo(() => data?.pages.flat() ?? [], [data])

  function handleDelete(id: string, code: string) {
    deleteCoupon.mutate(id, {
      onSuccess: () => toast.success(`${code} was deleted.`),
      onError: (error) =>
        toast.error(error instanceof ApiError ? error.message : "Could not delete coupon."),
    })
  }

  return (
    <Card className="w-full max-w-2xl">
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

            {coupons.map((coupon) => (
              <TableRow key={coupon.id}>
                <TableCell className="font-medium">{coupon.code}</TableCell>
                <TableCell>
                  <Badge variant="outline">{coupon.source}</Badge>
                </TableCell>
                <TableCell>
                  {coupon.successCount} / {coupon.failCount}
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-3">
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
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {hasNextPage && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
          >
            {isFetchingNextPage ? "Loading…" : "Load more"}
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
