"use client"

import * as React from "react"
import { toast } from "sonner"
import { PencilIcon, PlusIcon } from "lucide-react"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Combobox } from "@/components/ui/combobox"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { FormField, FormGrid } from "@/components/dashboard/form-section"
import { useCreateScrapeSource, useUpdateScrapeSource } from "@/lib/api/hooks/use-scrape-sources"
import { ApiError } from "@/lib/api/client"
import type { Merchant, ScrapeSource } from "@/lib/api/types"

const UNIT_MINUTES = { minutes: 1, hours: 60, days: 1440, weeks: 10080 } as const
type IntervalUnit = keyof typeof UNIT_MINUTES
const UNIT_OPTIONS: { value: IntervalUnit; label: string }[] = [
  { value: "minutes", label: "Minutes" },
  { value: "hours", label: "Hours" },
  { value: "days", label: "Days" },
  { value: "weeks", label: "Weeks" },
]

const scrapeSourceSchema = z
  .object({
    merchantId: z.string(),
    url: z.string().trim().min(1, "Page URL is required"),
    codeSelector: z.string().trim().min(1, "Coupon code selector is required"),
    descriptionSelector: z.string().trim(),
    intervalAmount: z
      .string()
      .trim()
      .regex(/^\d+$/, "Enter a whole number")
      .refine((value) => Number(value) > 0, "Must be at least 1"),
    intervalUnit: z.enum(["minutes", "hours", "days", "weeks"]),
  })
  .superRefine((data, ctx) => {
    if (!data.merchantId) {
      ctx.addIssue({ code: "custom", message: "Choose a merchant", path: ["merchantId"] })
    }
  })

type ScrapeSourceFormValues = z.infer<typeof scrapeSourceSchema>

/** Picks the largest unit the total divides evenly into, so an edit form shows "1 day" instead
 * of "1440 minutes" — falls back to raw minutes when nothing divides evenly. */
function decomposeMinutes(totalMinutes: number): { amount: string; unit: IntervalUnit } {
  const units: IntervalUnit[] = ["weeks", "days", "hours", "minutes"]
  for (const unit of units) {
    const perUnit = UNIT_MINUTES[unit]
    if (totalMinutes % perUnit === 0) {
      return { amount: String(totalMinutes / perUnit), unit }
    }
  }
  return { amount: String(totalMinutes), unit: "minutes" }
}

/**
 * Create-or-edit scrape source dialog. Pass `merchantId` when used inside a merchant's own page
 * (locks the merchant, hides the picker); pass `merchants` for the cross-merchant list, where the
 * picker is shown but still required — the scrape processor has no per-item merchant resolution
 * strategy yet, so a merchant-less source would silently never produce any coupons. Pass `source` to edit.
 */
export function ScrapeSourceDialog({
  merchantId,
  merchants,
  source,
}: {
  merchantId?: string
  merchants?: Merchant[]
  source?: ScrapeSource
}) {
  const isEdit = !!source
  const [open, setOpen] = React.useState(false)

  const createSource = useCreateScrapeSource()
  const updateSource = useUpdateScrapeSource(source?.id ?? "")
  const isPending = createSource.isPending || updateSource.isPending

  const initialInterval = decomposeMinutes(source?.intervalMinutes ?? 1440)

  const {
    register,
    control,
    handleSubmit,
    reset: resetForm,
    formState: { errors, isSubmitting },
  } = useForm<ScrapeSourceFormValues>({
    resolver: zodResolver(scrapeSourceSchema),
    mode: "onTouched",
    reValidateMode: "onChange",
    defaultValues: {
      merchantId: merchantId ?? source?.merchantId ?? "",
      url: source?.url ?? "",
      codeSelector: source?.selectorConfig.codeSelector ?? "",
      descriptionSelector: source?.selectorConfig.descriptionSelector ?? "",
      intervalAmount: initialInterval.amount,
      intervalUnit: initialInterval.unit,
    },
  })

  function reset() {
    const reverted = decomposeMinutes(1440)
    resetForm({
      merchantId: merchantId ?? "",
      url: "",
      codeSelector: "",
      descriptionSelector: "",
      intervalAmount: reverted.amount,
      intervalUnit: reverted.unit,
    })
  }

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next && !isEdit) reset()
  }

  function onSubmit(values: ScrapeSourceFormValues) {
    const shared = {
      url: values.url,
      merchantId: values.merchantId,
      selectorConfig: {
        codeSelector: values.codeSelector,
        descriptionSelector: values.descriptionSelector || undefined,
      },
      intervalMinutes: Number(values.intervalAmount) * UNIT_MINUTES[values.intervalUnit],
    }

    if (isEdit) {
      updateSource.mutate(shared, {
        onSuccess: () => {
          toast.success("Scrape source updated.")
          handleOpenChange(false)
        },
        onError: (error) =>
          toast.error(error instanceof ApiError ? error.message : "Could not update scrape source."),
      })
    } else {
      createSource.mutate(shared, {
        onSuccess: () => {
          toast.success("Scrape source added.")
          handleOpenChange(false)
        },
        onError: (error) =>
          toast.error(error instanceof ApiError ? error.message : "Could not add scrape source."),
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {isEdit ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={() => setOpen(true)}
          className="text-muted-foreground hover:text-foreground"
          aria-label={`Edit ${source?.url}`}
        >
          <PencilIcon className="size-3.5" />
        </Button>
      ) : (
        <Button onClick={() => setOpen(true)} className="gap-1.5">
          <PlusIcon className="size-4" />
          New Scrape Source
        </Button>
      )}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit scrape source" : "New scrape source"}</DialogTitle>
          <DialogDescription>
            A page URL plus CSS selectors the scraper uses to extract coupon codes.
          </DialogDescription>
        </DialogHeader>

        <form className="flex flex-1 flex-col justify-between" onSubmit={handleSubmit(onSubmit)} noValidate>
          <div className="flex flex-col gap-4 px-6">
            <FormField label="Page URL" htmlFor="scrape-url" error={errors.url?.message}>
              <Input id="scrape-url" type="url" placeholder="https://…" {...register("url")} />
            </FormField>
            {!merchantId && (
              <FormField label="Merchant" htmlFor="scrape-merchant" error={errors.merchantId?.message}>
                <Controller
                  name="merchantId"
                  control={control}
                  render={({ field, fieldState }) => (
                    <Combobox
                      id="scrape-merchant"
                      value={field.value}
                      onValueChange={field.onChange}
                      placeholder="Select a merchant"
                      searchPlaceholder="Search merchants..."
                      options={merchants?.map((merchant) => ({ value: merchant.id, label: merchant.name })) ?? []}
                      aria-invalid={!!fieldState.error}
                    />
                  )}
                />
              </FormField>
            )}
            <FormGrid>
              <FormField label="Coupon code selector" htmlFor="scrape-code-selector" error={errors.codeSelector?.message}>
                <Input id="scrape-code-selector" placeholder=".coupon-code" {...register("codeSelector")} />
              </FormField>
              <FormField label="Description selector (optional)" htmlFor="scrape-description-selector">
                <Input id="scrape-description-selector" {...register("descriptionSelector")} />
              </FormField>
            </FormGrid>
            <FormField
              label="Scrape every"
              htmlFor="scrape-interval"
              hint="Defaults to daily."
              error={errors.intervalAmount?.message}
            >
              <div className="flex gap-2">
                <Input
                  id="scrape-interval"
                  type="number"
                  min="1"
                  {...register("intervalAmount")}
                  aria-invalid={!!errors.intervalAmount}
                  className="w-24"
                />
                <Controller
                  name="intervalUnit"
                  control={control}
                  render={({ field }) => (
                    <Combobox value={field.value} onValueChange={field.onChange} options={UNIT_OPTIONS} className="flex-1" />
                  )}
                />
              </div>
            </FormField>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={isPending || isSubmitting}>
              {isPending || isSubmitting ? "Saving…" : isEdit ? "Save changes" : "Add scrape source"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
