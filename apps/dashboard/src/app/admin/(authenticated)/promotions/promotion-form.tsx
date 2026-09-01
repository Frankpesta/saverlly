"use client"

import * as React from "react"
import Link from "next/link"
import { ArrowLeftIcon } from "lucide-react"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { DateTimePicker } from "@/components/dashboard/date-time-picker"
import { FormField, FormGrid, FormSection } from "@/components/dashboard/form-section"
import { useLocations } from "@/lib/api/hooks/use-locations"
import type { PromotionPayload } from "@/lib/api/hooks/use-promotions"
import { toDatetimeLocal } from "@/lib/format-date"
import { cn } from "@/lib/utils"
import { PromotionPreview } from "./promotion-preview"
import { PromotionCreativeField } from "./promotion-creative-field"
import { PromotionTargetPicker } from "./promotion-target-picker"

const promotionSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required"),
    imageSmallUrl: z.string().trim().min(1, "The 320×100 creative is required"),
    imageLargeUrl: z.string().trim().min(1, "The 728×90 creative is required"),
    clickUrl: z.string().trim().url("Enter a full URL, including https://"),
    startAt: z.string().min(1, "Start date is required"),
    endAt: z.string().min(1, "End date is required"),
    active: z.boolean(),
    targetTags: z.array(z.string()),
    locationIds: z.array(z.string()),
  })
  .superRefine((data, ctx) => {
    // Mirrors the backend's own check, so the error lands on the field instead of arriving
    // as a toast after a round-trip.
    if (data.startAt && data.endAt && new Date(data.endAt) <= new Date(data.startAt)) {
      ctx.addIssue({ code: "custom", message: "End must be after the start", path: ["endAt"] })
    }
  })

export type PromotionFormValues = z.infer<typeof promotionSchema>

export function emptyPromotionForm(): PromotionFormValues {
  return {
    name: "",
    imageSmallUrl: "",
    imageLargeUrl: "",
    clickUrl: "",
    startAt: toDatetimeLocal(new Date()),
    endAt: toDatetimeLocal(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)),
    active: true,
    targetTags: [],
    locationIds: [],
  }
}

export function toPromotionPayload(values: PromotionFormValues): PromotionPayload {
  return {
    name: values.name,
    imageSmallUrl: values.imageSmallUrl,
    imageLargeUrl: values.imageLargeUrl,
    clickUrl: values.clickUrl,
    targetTags: values.targetTags,
    locationIds: values.locationIds,
    startAt: new Date(values.startAt).toISOString(),
    endAt: new Date(values.endAt).toISOString(),
    active: values.active,
  }
}

/**
 * The whole promotion on one page — every field visible at once with the extension preview pinned
 * alongside, rather than a stepped wizard. There are only four things to fill in and the creative
 * is the point of the exercise, so hiding two thirds of it behind Continue buttons would cost more
 * than it guides.
 */
export function PromotionForm({
  defaultValues,
  submitLabel,
  pendingLabel,
  heading,
  description,
  onSubmit,
  isPending,
  headerActions,
}: {
  defaultValues: PromotionFormValues
  submitLabel: string
  pendingLabel: string
  heading: string
  description: string
  onSubmit: (values: PromotionFormValues) => void
  isPending: boolean
  headerActions?: React.ReactNode
}) {
  const { data: locations } = useLocations()

  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<PromotionFormValues>({
    resolver: zodResolver(promotionSchema),
    mode: "onTouched",
    reValidateMode: "onChange",
    defaultValues,
  })

  const imageSmallUrl = watch("imageSmallUrl")
  const imageLargeUrl = watch("imageLargeUrl")
  const clickUrl = watch("clickUrl")

  return (
    <form className="flex flex-col gap-6" onSubmit={handleSubmit(onSubmit)} noValidate>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <Link
            href="/admin/promotions"
            className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeftIcon className="size-3.5" />
            Promotions
          </Link>
          <h2 className="text-2xl font-semibold tracking-tight">{heading}</h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <div className="flex items-center gap-2">
          {headerActions}
          <Link
            href="/admin/promotions"
            className={cn(buttonVariants({ variant: "outline" }))}
          >
            Cancel
          </Link>
          <Button type="submit" disabled={isPending}>
            {isPending ? pendingLabel : submitLabel}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
        <div className="flex flex-col gap-8">
          <FormSection label="Details">
            <FormField
              label="Name"
              htmlFor="promo-name"
              hint="Internal only — shoppers never see this."
              error={errors.name?.message}
            >
              <Input id="promo-name" {...register("name")} />
            </FormField>
            <FormField
              label="Click-through URL"
              htmlFor="promo-click"
              hint="Where the shopper lands when they click the creative."
              error={errors.clickUrl?.message}
            >
              <Input id="promo-click" type="url" placeholder="https://…" {...register("clickUrl")} />
            </FormField>
          </FormSection>

          <FormSection
            label="Creatives"
            description="Both sizes are required. A larger export is fine as long as the shape matches."
          >
            <PromotionCreativeField
              size="small"
              id="promo-small"
              value={imageSmallUrl}
              onChange={(url) => setValue("imageSmallUrl", url, { shouldValidate: true })}
              error={errors.imageSmallUrl?.message}
            />
            <PromotionCreativeField
              size="large"
              id="promo-large"
              value={imageLargeUrl}
              onChange={(url) => setValue("imageLargeUrl", url, { shouldValidate: true })}
              error={errors.imageLargeUrl?.message}
            />
          </FormSection>

          <FormSection label="Schedule">
            <FormGrid>
              <FormField label="Starts" htmlFor="promo-start" error={errors.startAt?.message}>
                <Controller
                  name="startAt"
                  control={control}
                  render={({ field, fieldState }) => (
                    <DateTimePicker
                      id="promo-start"
                      value={field.value}
                      onChange={field.onChange}
                      aria-invalid={!!fieldState.error}
                    />
                  )}
                />
              </FormField>
              <FormField label="Ends" htmlFor="promo-end" error={errors.endAt?.message}>
                <Controller
                  name="endAt"
                  control={control}
                  render={({ field, fieldState }) => (
                    <DateTimePicker
                      id="promo-end"
                      value={field.value}
                      onChange={field.onChange}
                      aria-invalid={!!fieldState.error}
                    />
                  )}
                />
              </FormField>
            </FormGrid>
            <div className="flex items-center justify-between rounded-lg border border-black/8 p-3 dark:border-white/10">
              <div>
                <Label htmlFor="promo-active">Active</Label>
                <p className="text-sm text-muted-foreground">
                  Turn off to pull the promotion without changing its dates.
                </p>
              </div>
              <Controller
                name="active"
                control={control}
                render={({ field }) => (
                  <Switch
                    id="promo-active"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                )}
              />
            </div>
          </FormSection>

          <FormSection
            label="Targeting"
            description="A device sees this promotion if its location matches a tag or is picked directly."
          >
            <Controller
              name="targetTags"
              control={control}
              render={({ field: tagsField }) => (
                <Controller
                  name="locationIds"
                  control={control}
                  render={({ field: locationsField }) => (
                    <PromotionTargetPicker
                      locations={locations ?? []}
                      tags={tagsField.value}
                      locationIds={locationsField.value}
                      onTagsChange={tagsField.onChange}
                      onLocationIdsChange={locationsField.onChange}
                    />
                  )}
                />
              )}
            />
          </FormSection>
        </div>

        {/* Pinned so the creative stays in view while the schedule and targeting sections are
            filled in further down the page. */}
        <div className="lg:sticky lg:top-6 lg:self-start">
          <PromotionPreview imageSmallUrl={imageSmallUrl} clickUrl={clickUrl} />
        </div>
      </div>
    </form>
  )
}
