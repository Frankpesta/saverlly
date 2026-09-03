"use client"

import { useSearchParams } from "next/navigation"
import { useMerchants } from "@/lib/api/hooks/use-merchants"
import { CouponForm } from "../coupon-form"

export default function NewCouponPage() {
  const searchParams = useSearchParams()
  // Set when the flow is started from a merchant's own page, which locks the coupon to that
  // merchant and sends Cancel/Save back there rather than to the global list.
  const merchantId = searchParams.get("merchantId") ?? undefined
  const { data: merchants } = useMerchants()

  const merchant = merchantId ? merchants?.find((m) => m.id === merchantId) : undefined

  return (
    <CouponForm
      merchants={merchants}
      lockedMerchantId={merchantId}
      backHref={merchantId ? `/admin/merchants/${merchantId}` : "/admin/coupons"}
      backLabel={merchantId ? (merchant?.name ?? "Merchant") : "Coupons"}
    />
  )
}
