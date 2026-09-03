"use client"

import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Input } from "@/components/ui/input"
import { Combobox } from "@/components/ui/combobox"
import { EntityFormCard, EntityFormHeader } from "@/components/dashboard/entity-form-page"
import { FormField, FormGrid, FormSection } from "@/components/dashboard/form-section"
import { SelectorHelp } from "@/components/dashboard/selector-help"
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

/** Upper bound per unit, so "every 99999 minutes" can't be entered. Each caps out at roughly a
 * year of real time, which is far beyond any sensible scrape cadence but still leaves the field
 * usable without arguing with the person typing. */
const UNIT_MAX: Record<IntervalUnit, number> = {
  minutes: 10080, // a week
  hours: 720, // a month
  days: 365,
  weeks: 52,
}

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
    const max = UNIT_MAX[data.intervalUnit]
    if (Number(data.intervalAmount) > max) {
      ctx.addIssue({
        code: "custom",
        message: `At most ${max.toLocaleString()} ${data.intervalUnit}`,
        path: ["intervalAmount"],
      })
    }
  })

export type ScrapeSourceFormValues = z.infer<typeof scrapeSourceSchema>

/** Picks the largest unit the total divides evenly into, so an edit form shows "1 day" instead
 * of "1440 minutes". Falls back to raw minutes when nothing divides evenly. */
export function decomposeMinutes(totalMinutes: number): { amount: string; unit: IntervalUnit } {
  const units: IntervalUnit[] = ["weeks", "days", "hours", "minutes"]
  for (const unit of units) {
    const perUnit = UNIT_MINUTES[unit]
    if (totalMinutes % perUnit === 0) {
      return { amount: String(totalMinutes / perUnit), unit }
    }
  }
  return { amount: String(totalMinutes), unit: "minutes" }
}

/** Restates the interval as a real-world cadence. "222 minutes" on its own is hard to judge;
 * "about 6 times a day" is the thing the person actually cares about. */
export function describeCadence(amount: string, unit: IntervalUnit): string | null {
  const n = Number(amount)
  if (!Number.isFinite(n) || n <= 0) return null
  const minutes = n * UNIT_MINUTES[unit]
  if (minutes < 60) return `Runs about ${Math.round(1440 / minutes)} times a day.`
  const perDay = 1440 / minutes
  if (perDay >= 2) return `Runs about ${Math.round(perDay)} times a day.`
  if (Math.abs(minutes - 1440) < 1) return "Runs once a day."
  const days = minutes / 1440
  if (days < 1) return "Runs about twice a day."
  if (days <= 31) return `Runs about every ${Math.round(days)} day${Math.round(days) === 1 ? "" : "s"}.`
  return `Runs about every ${Math.round(days / 7)} weeks.`
}

export function ScrapeSourceForm({
  source,
  merchants,
  lockedMerchantId,
  backHref,
  backLabel,
}: {
  /** Present when editing. */
  source?: ScrapeSource
  /** Options for the merchant picker. Omit when `lockedMerchantId` is set. */
  merchants?: Merchant[]
  /** Locks the source to one merchant and hides the picker, for the flow started from a
   * merchant's own page. */
  lockedMerchantId?: string
  backHref: string
  backLabel: string
}) {
  const router = useRouter()
  const isEdit = !!source
  const createSource = useCreateScrapeSource()
  const updateSource = useUpdateScrapeSource(source?.id ?? "")
  const initialInterval = decomposeMinutes(source?.intervalMinutes ?? 1440)

  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<ScrapeSourceFormValues>({
    resolver: zodResolver(scrapeSourceSchema),
    mode: "onTouched",
    reValidateMode: "onChange",
    defaultValues: {
      merchantId: lockedMerchantId ?? source?.merchantId ?? "",
      url: source?.url ?? "",
      codeSelector: source?.selectorConfig.codeSelector ?? "",
      descriptionSelector: source?.selectorConfig.descriptionSelector ?? "",
      intervalAmount: initialInterval.amount,
      intervalUnit: initialInterval.unit,
    },
  })

  const intervalAmount = watch("intervalAmount")
  const intervalUnit = watch("intervalUnit")
  const cadence = errors.intervalAmount ? null : describeCadence(intervalAmount, intervalUnit)

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

    const onSuccess = (message: string) => () => {
      toast.success(message)
      router.push(backHref)
    }
    const onError = (verb: string) => (error: unknown) =>
      toast.error(error instanceof ApiError ? error.message : `Could not ${verb} scrape source.`)

    if (isEdit) {
      updateSource.mutate(shared, {
        onSuccess: onSuccess("Scrape source updated."),
        onError: onError("update"),
      })
    } else {
      createSource.mutate(shared, {
        onSuccess: onSuccess("Scrape source added."),
        onError: onError("add"),
      })
    }
  }

  const isPending = createSource.isPending || updateSource.isPending || isSubmitting

  return (
    <form className="flex flex-col gap-6" onSubmit={handleSubmit(onSubmit)} noValidate>
      <EntityFormHeader
        backHref={backHref}
        backLabel={backLabel}
        heading={isEdit ? "Edit scrape source" : "New scrape source"}
        description="A page URL plus CSS selectors the scraper uses to extract coupon codes."
      />

      <EntityFormCard
        cancelHref={backHref}
        submitLabel={isEdit ? "Save changes" : "Add scrape source"}
        pendingLabel="Saving…"
        isPending={isPending}
      >
        <FormSection label="Source">
          <FormField label="Page URL" htmlFor="scrape-url" error={errors.url?.message}>
            <Input id="scrape-url" type="url" placeholder="https://…" {...register("url")} />
          </FormField>
          {!lockedMerchantId && (
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
        </FormSection>

        <FormSection label="Selectors">
          <FormGrid>
            <FormField label="Coupon code selector" htmlFor="scrape-code-selector" error={errors.codeSelector?.message}>
              <Input id="scrape-code-selector" placeholder=".coupon-code" {...register("codeSelector")} />
              <SelectorHelp />
            </FormField>
            <FormField label="Description selector (optional)" htmlFor="scrape-description-selector">
              <Input
                id="scrape-description-selector"
                placeholder=".coupon-description"
                {...register("descriptionSelector")}
              />
            </FormField>
          </FormGrid>
        </FormSection>

        <FormSection label="Schedule">
          {/* The hint used to read "Defaults to daily", which sounded like a promise about an
              empty field even though the field is always pre-filled with 1 / Days. It is
              replaced by a live restatement of the actual cadence. */}
          <FormField
            label="Scrape every"
            htmlFor="scrape-interval"
            hint={cadence ?? undefined}
            error={errors.intervalAmount?.message}
          >
            <div className="flex gap-2">
              <Input
                id="scrape-interval"
                inputMode="numeric"
                value={intervalAmount}
                // Strips anything non-numeric and leading zeros as you type, so "00222" can no
                // longer be entered at all. type="number" allowed it: the form is noValidate,
                // so min/max on the element were never enforced.
                onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, "").replace(/^0+(?=\d)/, "")
                  setValue("intervalAmount", digits, { shouldValidate: true, shouldDirty: true })
                }}
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
        </FormSection>
      </EntityFormCard>
    </form>
  )
}
