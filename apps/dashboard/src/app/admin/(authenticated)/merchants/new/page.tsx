"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Combobox } from "@/components/ui/combobox"
import { EntityFormCard, EntityFormHeader } from "@/components/dashboard/entity-form-page"
import { FormField, FormGrid, FormSection } from "@/components/dashboard/form-section"
import { SelectorHelp } from "@/components/dashboard/selector-help"
import { useCreateMerchant } from "@/lib/api/hooks/use-merchants"
import { useAffiliatePrograms } from "@/lib/api/hooks/use-affiliate-programs"
import { useCreateScrapeSource } from "@/lib/api/hooks/use-scrape-sources"
import { ApiError } from "@/lib/api/client"
import { attributionFieldsSchema, nameSchema } from "@/lib/validation/schemas"
import { AttributionFields } from "../attribution-fields"

const newMerchantSchema = z
  .object({
    name: nameSchema,
    domain: z.string().trim().min(1, "Domain is required"),
    tracking: attributionFieldsSchema,
    affiliateProgramId: z.string(),
    addScrapeSource: z.boolean(),
    scrapeUrl: z.string().trim(),
    codeSelector: z.string().trim(),
    descriptionSelector: z.string().trim(),
  })
  .superRefine((data, ctx) => {
    if (data.addScrapeSource) {
      if (!data.scrapeUrl) {
        ctx.addIssue({ code: "custom", message: "Required to add a scrape source now", path: ["scrapeUrl"] })
      }
      if (!data.codeSelector) {
        ctx.addIssue({ code: "custom", message: "Required to add a scrape source now", path: ["codeSelector"] })
      }
    }
  })

type NewMerchantFormValues = z.infer<typeof newMerchantSchema>

export default function NewMerchantPage() {
  const router = useRouter()
  const createMerchant = useCreateMerchant()
  const createScrapeSource = useCreateScrapeSource()
  const { data: affiliatePrograms } = useAffiliatePrograms()

  const {
    register,
    control,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<NewMerchantFormValues>({
    resolver: zodResolver(newMerchantSchema),
    mode: "onTouched",
    reValidateMode: "onChange",
    defaultValues: {
      name: "",
      domain: "",
      tracking: {
        attributionMethod: "COOKIE",
        affiliateTrackingUrl: "",
        affiliateUrlParamKey: "",
        affiliateUrlParamValue: "",
      },
      affiliateProgramId: "",
      addScrapeSource: false,
      scrapeUrl: "",
      codeSelector: "",
      descriptionSelector: "",
    },
  })

  const addScrapeSource = watch("addScrapeSource")

  function onSubmit(values: NewMerchantFormValues) {
    createMerchant.mutate(
      {
        name: values.name,
        domain: values.domain,
        attributionMethod: values.tracking.attributionMethod,
        affiliateTrackingUrl: values.tracking.affiliateTrackingUrl || undefined,
        affiliateUrlParamKey: values.tracking.affiliateUrlParamKey || undefined,
        affiliateUrlParamValue: values.tracking.affiliateUrlParamValue || undefined,
        affiliateProgramId: values.affiliateProgramId || undefined,
      },
      {
        onSuccess: async (merchant) => {
          if (values.addScrapeSource && values.scrapeUrl && values.codeSelector) {
            try {
              await createScrapeSource.mutateAsync({
                url: values.scrapeUrl,
                merchantId: merchant.id,
                selectorConfig: {
                  codeSelector: values.codeSelector,
                  descriptionSelector: values.descriptionSelector || undefined,
                },
              })
            } catch (error) {
              toast.error(
                error instanceof ApiError
                  ? `Store created, but the scrape source failed: ${error.message}`
                  : "Store created, but the scrape source failed.",
              )
              router.push(`/admin/merchants/${merchant.id}`)
              return
            }
          }
          toast.success(`${values.name} was added.`)
          router.push(`/admin/merchants/${merchant.id}`)
        },
        onError: (error) =>
          toast.error(error instanceof ApiError ? error.message : "Could not add store."),
      },
    )
  }

  const isPending = createMerchant.isPending || createScrapeSource.isPending || isSubmitting

  return (
    <form className="flex flex-col gap-6" onSubmit={handleSubmit(onSubmit)} noValidate>
      <EntityFormHeader backHref="/admin/merchants" backLabel="Merchants" heading="Add store" />

      <EntityFormCard
        cancelHref="/admin/merchants"
        submitLabel="Add store"
        pendingLabel="Adding…"
        isPending={isPending}
      >
        <FormSection label="Basic info">
          <FormGrid>
            <FormField label="Name" htmlFor="new-merchant-name" error={errors.name?.message}>
              <Input id="new-merchant-name" {...register("name")} />
            </FormField>
            <FormField label="Domain" htmlFor="new-merchant-domain" error={errors.domain?.message}>
              <Input id="new-merchant-domain" placeholder="target.com" {...register("domain")} />
            </FormField>
          </FormGrid>
        </FormSection>

        <FormSection
          label="Tracking method"
          description="How we earn commission from this store. Required, even for a store with no coupon API."
        >
          <Controller
            name="tracking"
            control={control}
            render={({ field }) => (
              <AttributionFields
                idPrefix="new-merchant"
                value={field.value}
                onChange={field.onChange}
                errors={{
                  affiliateTrackingUrl: errors.tracking?.affiliateTrackingUrl?.message,
                  affiliateUrlParamKey: errors.tracking?.affiliateUrlParamKey?.message,
                  affiliateUrlParamValue: errors.tracking?.affiliateUrlParamValue?.message,
                }}
              />
            )}
          />
        </FormSection>

        <FormSection label="Coupon sourcing" description="Optional. How coupon codes get in.">
          <FormField label="Affiliate program (optional)" htmlFor="new-merchant-program">
            <Controller
              name="affiliateProgramId"
              control={control}
              render={({ field }) => (
                <Combobox
                  id="new-merchant-program"
                  value={field.value}
                  onValueChange={field.onChange}
                  placeholder="None"
                  searchPlaceholder="Search affiliate programs..."
                  options={
                    affiliatePrograms?.map((program) => ({
                      value: program.id,
                      label: program.networkName,
                    })) ?? []
                  }
                />
              )}
            />
            <Link
              href="/admin/affiliate-programs"
              className="w-fit text-sm text-muted-foreground hover:underline"
            >
              Manage affiliate programs
            </Link>
          </FormField>

          <div className="flex items-center justify-between rounded-lg border border-black/8 p-3 dark:border-white/10">
            <div>
              <Label htmlFor="new-merchant-add-scrape">Add a scrape source now</Label>
              <p className="text-sm text-muted-foreground">
                You can also add this later from Scrape Sources.
              </p>
            </div>
            <Controller
              name="addScrapeSource"
              control={control}
              render={({ field }) => (
                <Switch
                  id="new-merchant-add-scrape"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              )}
            />
          </div>

          {addScrapeSource && (
            <>
              <FormField label="Page URL" htmlFor="new-merchant-scrape-url" error={errors.scrapeUrl?.message}>
                <Input
                  id="new-merchant-scrape-url"
                  type="url"
                  placeholder="https://…"
                  {...register("scrapeUrl")}
                />
              </FormField>
              <FormField
                label="Coupon code selector"
                htmlFor="new-merchant-code-selector"
                error={errors.codeSelector?.message}
              >
                <Input id="new-merchant-code-selector" placeholder=".coupon-code" {...register("codeSelector")} />
                <SelectorHelp />
              </FormField>
              <FormField
                label="Description selector (optional)"
                htmlFor="new-merchant-description-selector"
              >
                <Input
                  id="new-merchant-description-selector"
                  placeholder=".coupon-description"
                  {...register("descriptionSelector")}
                />
              </FormField>
            </>
          )}
        </FormSection>
      </EntityFormCard>
    </form>
  )
}
