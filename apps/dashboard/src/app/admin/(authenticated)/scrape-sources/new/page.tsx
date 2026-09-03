"use client"

import { useSearchParams } from "next/navigation"
import { useMerchants } from "@/lib/api/hooks/use-merchants"
import { ScrapeSourceForm } from "../scrape-source-form"

export default function NewScrapeSourcePage() {
  const searchParams = useSearchParams()
  // Set when the flow is started from a merchant's own page, which locks the source to that
  // merchant and sends Cancel/Save back there rather than to the global list.
  const merchantId = searchParams.get("merchantId") ?? undefined
  const { data: merchants } = useMerchants()

  const merchant = merchantId ? merchants?.find((m) => m.id === merchantId) : undefined

  return (
    <ScrapeSourceForm
      merchants={merchants}
      lockedMerchantId={merchantId}
      backHref={merchantId ? `/admin/merchants/${merchantId}` : "/admin/scrape-sources"}
      backLabel={merchantId ? (merchant?.name ?? "Merchant") : "Scrape sources"}
    />
  )
}
