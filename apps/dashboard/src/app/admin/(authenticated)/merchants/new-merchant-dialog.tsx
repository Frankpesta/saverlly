"use client"

import * as React from "react"
import Link from "next/link"
import { toast } from "sonner"
import { PlusIcon } from "lucide-react"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Combobox,
} from "@/components/ui/combobox"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { WizardStepDots } from "@/components/dashboard/wizard-step-dots"
import { FormField, FormGrid } from "@/components/dashboard/form-section"
import { useCreateMerchant } from "@/lib/api/hooks/use-merchants"
import { useAffiliatePrograms } from "@/lib/api/hooks/use-affiliate-programs"
import { useCreateScrapeSource } from "@/lib/api/hooks/use-scrape-sources"
import { ApiError } from "@/lib/api/client"
import { attributionFieldsSchema, nameSchema } from "@/lib/validation/schemas"
import { AttributionFields } from "./attribution-fields"

type StepKey = "info" | "tracking" | "sourcing"

const STEP_INFO: Record<StepKey, { title: string; description: string }> = {
  info: { title: "Basic info", description: "Who is this store?" },
  tracking: { title: "Tracking method", description: "How do we earn commission from this store?" },
  sourcing: { title: "Coupon sourcing", description: "Optional — how should coupon codes get in?" },
}

const stepKeys: StepKey[] = ["info", "tracking", "sourcing"]

const STEP_FIELDS: Partial<Record<StepKey, ("name" | "domain" | "tracking")[]>> = {
  info: ["name", "domain"],
  tracking: ["tracking"],
}

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

export function NewMerchantDialog() {
  const [open, setOpen] = React.useState(false)
  const [step, setStep] = React.useState(0)

  const createMerchant = useCreateMerchant()
  const createScrapeSource = useCreateScrapeSource()
  const { data: affiliatePrograms } = useAffiliatePrograms()

  const {
    register,
    control,
    handleSubmit,
    trigger,
    watch,
    reset: resetForm,
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

  const stepKey = stepKeys[step]
  const addScrapeSource = watch("addScrapeSource")

  function reset() {
    setStep(0)
    resetForm()
  }

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) reset()
  }

  async function handleContinue() {
    const fields = STEP_FIELDS[stepKey]
    if (fields && !(await trigger(fields))) return
    setStep(step + 1)
  }

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
              handleOpenChange(false)
              return
            }
          }
          toast.success(`${values.name} was added.`)
          handleOpenChange(false)
        },
        onError: (error) =>
          toast.error(error instanceof ApiError ? error.message : "Could not add store."),
      },
    )
  }

  const isPending = createMerchant.isPending || createScrapeSource.isPending || isSubmitting
  const isLastStep = stepKey === "sourcing"

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <Button onClick={() => setOpen(true)} className="gap-1.5">
        <PlusIcon className="size-4" />
        Add Store
      </Button>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{STEP_INFO[stepKey].title}</DialogTitle>
          <WizardStepDots count={stepKeys.length} current={step} steps={stepKeys.map((key) => STEP_INFO[key])} />
          <DialogDescription>{STEP_INFO[stepKey].description}</DialogDescription>
        </DialogHeader>

        <form
          className="flex flex-col justify-between"
          onSubmit={
            isLastStep
              ? handleSubmit(onSubmit)
              : (e) => {
                  e.preventDefault()
                  handleContinue()
                }
          }
          noValidate
        >
          <div className="flex flex-col gap-4 px-6">
            {stepKey === "info" && (
              <FormGrid>
                <FormField label="Name" htmlFor="new-merchant-name" error={errors.name?.message}>
                  <Input id="new-merchant-name" {...register("name")} />
                </FormField>
                <FormField label="Domain" htmlFor="new-merchant-domain" error={errors.domain?.message}>
                  <Input id="new-merchant-domain" placeholder="target.com" {...register("domain")} />
                </FormField>
              </FormGrid>
            )}

            {stepKey === "tracking" && (
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
            )}

            {stepKey === "sourcing" && (
              <>
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
                    className="text-sm text-muted-foreground hover:underline"
                  >
                    Manage affiliate programs →
                  </Link>
                </FormField>

                <div className="flex items-center justify-between rounded-lg border border-black/8 p-3">
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
                    </FormField>
                    <FormField
                      label="Description selector (optional)"
                      htmlFor="new-merchant-description-selector"
                    >
                      <Input id="new-merchant-description-selector" {...register("descriptionSelector")} />
                    </FormField>
                  </>
                )}
              </>
            )}
          </div>

          <DialogFooter className="flex-row justify-end">
            {step > 0 && (
              <Button type="button" variant="outline" onClick={() => setStep(step - 1)}>
                Back
              </Button>
            )}
            <Button type="submit" disabled={isPending}>
              {isLastStep ? (isPending ? "Adding…" : "Add store") : "Continue"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
