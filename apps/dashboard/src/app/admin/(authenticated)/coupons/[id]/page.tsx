"use client"

import { useParams, useSearchParams } from "next/navigation"
import { Skeleton } from "@/components/ui/skeleton"
import { useCoupons } from "@/lib/api/hooks/use-coupons"
import { useMerchants } from "@/lib/api/hooks/use-merchants"
import { CouponForm } from "../coupon-form"

export default function EditCouponPage() {
  const { id } = useParams<{ id: string }>()
  const searchParams = useSearchParams()
  const { data: coupons, isLoading, isError } = useCoupons()
  const { data: merchants } = useMerchants()

  // There is no single-coupon endpoint, so the row comes out of the list.
  const coupon = coupons?.find((c) => c.id === id)

  // Set when arriving from a merchant's own page, so Cancel/Save return there.
  const fromMerchantId = searchParams.get("merchantId")
  const merchant = fromMerchantId ? merchants?.find((m) => m.id === fromMerchantId) : undefined

  if (isError) {
    return <p className="text-sm text-destructive">Could not load this coupon.</p>
  }

  if (isLoading || !coupon) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-80 w-full max-w-2xl" />
      </div>
    )
  }

  return (
    <CouponForm
      // react-hook-form only reads defaultValues on mount, so a different coupon loading into
      // the same route needs a remount to show its own values.
      key={coupon.id}
      coupon={coupon}
      merchants={merchants}
      backHref={fromMerchantId ? `/admin/merchants/${fromMerchantId}` : "/admin/coupons"}
      backLabel={fromMerchantId ? (merchant?.name ?? "Merchant") : "Coupons"}
    />
  )
}
