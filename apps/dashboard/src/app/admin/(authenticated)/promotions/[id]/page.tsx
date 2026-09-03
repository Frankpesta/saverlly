"use client"

import { useParams, useRouter } from "next/navigation"
import { toast } from "sonner"
import { Skeleton } from "@/components/ui/skeleton"
import { DeleteRowButton } from "@/components/dashboard/delete-row-button"
import {
  useDeletePromotion,
  usePromotion,
  useUpdatePromotion,
} from "@/lib/api/hooks/use-promotions"
import { ApiError } from "@/lib/api/client"
import { toDatetimeLocal } from "@/lib/format-date"
import {
  PromotionForm,
  toPromotionPayload,
  type PromotionFormValues,
} from "../promotion-form"

export default function EditPromotionPage() {
  const params = useParams<{ id: string }>()
  const id = params.id
  const router = useRouter()

  const { data: promotion, isLoading, isError } = usePromotion(id)
  const updatePromotion = useUpdatePromotion(id)
  const deletePromotion = useDeletePromotion()

  function handleSubmit(values: PromotionFormValues) {
    updatePromotion.mutate(toPromotionPayload(values), {
      onSuccess: () => toast.success(`${values.name} was saved.`),
      onError: (error) =>
        toast.error(error instanceof ApiError ? error.message : "Could not save promotion."),
    })
  }

  function handleDelete() {
    deletePromotion.mutate(id, {
      onSuccess: () => {
        toast.success("Promotion deleted.")
        router.push("/admin/promotions")
      },
      onError: (error) =>
        toast.error(error instanceof ApiError ? error.message : "Could not delete promotion."),
    })
  }

  if (isError) {
    return <p className="text-sm text-destructive">Could not load this promotion.</p>
  }

  if (isLoading || !promotion) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-9 w-64" />
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
          <Skeleton className="h-96 w-full" />
          <Skeleton className="h-72 w-full" />
        </div>
      </div>
    )
  }

  return (
    <PromotionForm
      // Remounts when a different promotion loads. React-hook-form only reads defaultValues on
      // mount, so without this the form would keep showing the previously-viewed promotion.
      key={promotion.id}
      defaultValues={{
        name: promotion.name,
        imageSmallUrl: promotion.imageSmallUrl,
        imageLargeUrl: promotion.imageLargeUrl,
        clickUrl: promotion.clickUrl,
        startAt: toDatetimeLocal(promotion.startAt),
        endAt: toDatetimeLocal(promotion.endAt),
        active: promotion.active,
        // The API has no explicit flag: no tags and no locations is what "every device" means
        // on the wire, so the form's own everywhere field is reconstructed from that here.
        everywhere: promotion.targetTags.length === 0 && promotion.locationIds.length === 0,
        targetTags: promotion.targetTags,
        locationIds: promotion.locationIds,
      }}
      heading={promotion.name}
      description="Sponsored creative shown inside the Saverlly Chrome extension."
      submitLabel="Save changes"
      pendingLabel="Saving…"
      onSubmit={handleSubmit}
      isPending={updatePromotion.isPending}
      headerActions={
        <DeleteRowButton
          itemLabel={promotion.name}
          description="This removes the promotion immediately. Devices stop showing it on their next popup open."
          onConfirm={handleDelete}
          isPending={deletePromotion.isPending}
          ariaLabel={`Delete ${promotion.name}`}
          variant="button"
        />
      }
    />
  )
}
