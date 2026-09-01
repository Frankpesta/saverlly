"use client"

import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { useCreatePromotion } from "@/lib/api/hooks/use-promotions"
import { ApiError } from "@/lib/api/client"
import {
  PromotionForm,
  emptyPromotionForm,
  toPromotionPayload,
  type PromotionFormValues,
} from "../promotion-form"

export default function NewPromotionPage() {
  const router = useRouter()
  const createPromotion = useCreatePromotion()

  function handleSubmit(values: PromotionFormValues) {
    createPromotion.mutate(toPromotionPayload(values), {
      onSuccess: () => {
        toast.success(`${values.name} was created.`)
        router.push("/admin/promotions")
      },
      onError: (error) =>
        toast.error(error instanceof ApiError ? error.message : "Could not create promotion."),
    })
  }

  return (
    <PromotionForm
      defaultValues={emptyPromotionForm()}
      heading="New promotion"
      description="Sponsored creative shown inside the Saverlly Chrome extension."
      submitLabel="Publish promotion"
      pendingLabel="Publishing…"
      onSubmit={handleSubmit}
      isPending={createPromotion.isPending}
    />
  )
}
