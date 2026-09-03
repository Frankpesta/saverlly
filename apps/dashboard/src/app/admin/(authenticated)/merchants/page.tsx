"use client"

import * as React from "react"
import Link from "next/link"
import { toast } from "sonner"
import { PencilIcon, PlusIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableRowActions,
} from "@/components/ui/table"
import { DeleteRowButton } from "@/components/dashboard/delete-row-button"
import { TablePagination } from "@/components/dashboard/table-pagination"
import { CollectionArea, CollectionSummary, WorkspaceHeader } from "@/components/dashboard/page-layout"
import { useDeleteMerchant, useMerchants, useUpdateMerchant } from "@/lib/api/hooks/use-merchants"
import { useCoupons } from "@/lib/api/hooks/use-coupons"
import { ApiError } from "@/lib/api/client"
import type { AttributionMethod } from "@/lib/api/types"
import { usePagination } from "@/hooks/use-pagination"
import { cn } from "@/lib/utils"

const METHOD_LABEL: Record<AttributionMethod, string> = {
  COOKIE: "Cookie",
  URL_PARAM: "URL param",
  BOTH: "Both",
}

export default function MerchantsPage() {
  const { data: merchants, isLoading, isError } = useMerchants()
  const { data: coupons } = useCoupons()
  const { page, setPage, pageCount, pageItems, totalItems, pageSize } = usePagination(merchants)

  const couponCountByMerchant = React.useMemo(() => {
    const counts = new Map<string, number>()
    for (const coupon of coupons ?? []) {
      counts.set(coupon.merchantId, (counts.get(coupon.merchantId) ?? 0) + 1)
    }
    return counts
  }, [coupons])

  const stats = React.useMemo(() => {
    const list = merchants ?? []
    return {
      total: list.length,
      active: list.filter((m) => m.active).length,
      withProgram: list.filter((m) => !!m.affiliateProgramId).length,
    }
  }, [merchants])

  return (
    <div className="flex flex-col gap-6">
      <WorkspaceHeader
        title="Merchants"
        actions={
          <Link href="/admin/merchants/new" className={cn(buttonVariants(), "gap-1.5")}>
            <PlusIcon className="size-4" />
            Add Store
          </Link>
        }
      />

      <CollectionSummary items={[
        { label: "Merchants", value: stats.total, detail: "Tracked stores" },
        { label: "Active", value: stats.active, detail: "Currently enabled" },
        { label: "With programme", value: stats.withProgram, detail: "Affiliate-linked" },
      ]} />

      {isError && <p className="text-sm text-destructive">Could not load merchants.</p>}

      <CollectionArea title="Merchant directory" titleHidden count={totalItems}>
      <div className="flex flex-col gap-2">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Domain</TableHead>
              <TableHead>Tracking</TableHead>
              <TableHead>Coupons</TableHead>
              <TableHead>Active</TableHead>
              <TableHead className="w-10" />
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

            {!isLoading && merchants?.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  No merchants yet.
                </TableCell>
              </TableRow>
            )}

            {pageItems.map((merchant, index) => (
              <MerchantRow
                key={merchant.id}
                merchant={merchant}
                index={index}
                couponCount={couponCountByMerchant.get(merchant.id) ?? 0}
              />
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

function MerchantRow({
  merchant,
  index,
  couponCount,
}: {
  merchant: NonNullable<ReturnType<typeof useMerchants>["data"]>[number]
  index: number
  couponCount: number
}) {
  const updateMerchant = useUpdateMerchant(merchant.id)
  const deleteMerchant = useDeleteMerchant()

  function handleDelete() {
    deleteMerchant.mutate(merchant.id, {
      onSuccess: () => toast.success(`${merchant.name} was deleted.`),
      onError: (error) =>
        toast.error(error instanceof ApiError ? error.message : "Could not delete merchant."),
    })
  }

  function toggleActive() {
    updateMerchant.mutate(
      { active: !merchant.active },
      {
        onError: (error) =>
          toast.error(error instanceof ApiError ? error.message : "Could not update merchant."),
      },
    )
  }

  return (
    <TableRow index={index}>
      <TableCell className="font-medium">
        <Link href={`/admin/merchants/${merchant.id}`} className="hover:underline">
          {merchant.name}
        </Link>
      </TableCell>
      <TableCell>{merchant.domain}</TableCell>
      <TableCell>
        <Badge variant="info">{METHOD_LABEL[merchant.attributionMethod]}</Badge>
      </TableCell>
      <TableCell>{couponCount}</TableCell>
      <TableCell>
        <Switch
          checked={merchant.active}
          onCheckedChange={toggleActive}
          disabled={updateMerchant.isPending}
          aria-label={`Toggle ${merchant.name} active`}
        />
      </TableCell>
      <TableCell>
        <TableRowActions>
          <Link
            href={`/admin/merchants/${merchant.id}`}
            className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }), "text-muted-foreground hover:text-foreground")}
            aria-label={`Edit ${merchant.name}`}
          >
            <PencilIcon className="size-3.5" />
          </Link>
          <DeleteRowButton
            itemLabel={merchant.name}
            description="Its coupons, coupon test history, and commission events will be deleted too. Scrape sources are kept but stop pointing at any merchant. This can't be undone."
            onConfirm={handleDelete}
            isPending={deleteMerchant.isPending}
          />
        </TableRowActions>
      </TableCell>
    </TableRow>
  )
}
