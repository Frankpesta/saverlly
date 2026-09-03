"use client"

import * as React from "react"
import { toast } from "sonner"
import { CopyIcon, StoreIcon } from "lucide-react"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { EntityCreatedPanel, EntityFormCard, EntityFormHeader } from "@/components/dashboard/entity-form-page"
import { FormField, FormGrid, FormSection } from "@/components/dashboard/form-section"
import { RevenueShareInput } from "@/components/dashboard/revenue-share-input"
import { useCreateKiosk, type CreateKioskResult } from "@/lib/api/hooks/use-kiosks"
import { ApiError } from "@/lib/api/client"
import { emailSchema, nameSchema, revenueShareSchema } from "@/lib/validation/schemas"

const newKioskSchema = z.object({
  name: nameSchema,
  revenueSharePct: revenueShareSchema,
  owner: z.object({
    name: nameSchema,
    email: emailSchema,
  }),
})

type NewKioskFormValues = z.infer<typeof newKioskSchema>

const DEFAULT_VALUES: NewKioskFormValues = {
  name: "",
  revenueSharePct: 30,
  owner: { name: "", email: "" },
}

/** One page, not the previous four-step wizard. A wizard only made sense to fit the fields
 * inside a `sm:max-w-md` dialog; a page has room for all of it at once, matching how
 * promotions/promotion-form.tsx already does create flows in this app. The generated-password
 * reveal that used to be the wizard's fourth step is now a result panel that replaces the form
 * after a successful submit, rather than a step you page through. */
export default function NewKioskPage() {
  const createKiosk = useCreateKiosk()
  const [result, setResult] = React.useState<CreateKioskResult | null>(null)

  const {
    register,
    control,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<NewKioskFormValues>({
    resolver: zodResolver(newKioskSchema),
    mode: "onTouched",
    reValidateMode: "onChange",
    defaultValues: DEFAULT_VALUES,
  })

  const name = watch("name")

  async function copyPassword(password: string) {
    try {
      await navigator.clipboard.writeText(password)
      toast.success("Password copied.")
    } catch {
      toast.error("Could not copy to clipboard.")
    }
  }

  function onSubmit(values: NewKioskFormValues) {
    createKiosk.mutate(values, {
      onSuccess: (data) => setResult(data),
      onError: (error) =>
        toast.error(error instanceof ApiError ? error.message : "Could not create kiosk."),
    })
  }

  if (result) {
    return (
      <EntityCreatedPanel
        icon={<StoreIcon className="size-6" />}
        title={`${result.kiosk.name} is live`}
        description={`We also emailed these credentials to ${result.owner.email}. They'll be asked to set a new password the first time they sign in.`}
        doneHref={`/admin/kiosks/${result.kiosk.id}`}
        doneLabel="Go to kiosk"
      >
        <div className="flex flex-col gap-2 rounded-lg border border-black/8 px-4 py-3 text-left dark:border-white/10">
          <div>
            <p className="text-sm text-muted-foreground">Owner name</p>
            <p className="text-sm font-medium">{result.owner.name}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Owner email</p>
            <p className="text-sm font-medium">{result.owner.email}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Temporary password</p>
            <div className="flex items-center gap-2">
              <code className="rounded-md bg-muted px-2 py-1 font-mono text-sm tracking-wider">
                {result.generatedPassword}
              </code>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => copyPassword(result.generatedPassword)}
                aria-label="Copy password"
              >
                <CopyIcon className="size-3.5" />
              </Button>
            </div>
          </div>
        </div>
      </EntityCreatedPanel>
    )
  }

  return (
    <form className="flex flex-col gap-6" onSubmit={handleSubmit(onSubmit)} noValidate>
      <EntityFormHeader backHref="/admin/kiosks" backLabel="Kiosks" heading="New kiosk" />

      <EntityFormCard
        cancelHref="/admin/kiosks"
        submitLabel="Create kiosk"
        pendingLabel="Creating…"
        isPending={isSubmitting}
      >
        <FormSection label="Business">
          <FormField label="Kiosk name" htmlFor="new-kiosk-name" error={errors.name?.message}>
            <Input id="new-kiosk-name" {...register("name")} />
          </FormField>
          <FormField
            label="Revenue share (%)"
            htmlFor="new-kiosk-revenue"
            hint={`The percentage of commission ${name || "this kiosk"} keeps. New kiosks start active.`}
            error={errors.revenueSharePct?.message}
          >
            <Controller
              name="revenueSharePct"
              control={control}
              render={({ field, fieldState }) => (
                <RevenueShareInput
                  id="new-kiosk-revenue"
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  aria-invalid={!!fieldState.error}
                />
              )}
            />
          </FormField>
        </FormSection>

        <FormSection label="Owner" description="Who signs in to manage this kiosk.">
          <FormGrid>
            <FormField label="Owner name" htmlFor="new-kiosk-owner-name" error={errors.owner?.name?.message}>
              <Input id="new-kiosk-owner-name" {...register("owner.name")} />
            </FormField>
            <FormField
              label="Owner email"
              htmlFor="new-kiosk-owner-email"
              hint="We'll generate a secure password and email it to them. You'll also see it once after creating the kiosk. This also doubles as the kiosk's contact email."
              error={errors.owner?.email?.message}
            >
              <Input id="new-kiosk-owner-email" type="email" {...register("owner.email")} />
            </FormField>
          </FormGrid>
        </FormSection>
      </EntityFormCard>
    </form>
  )
}
