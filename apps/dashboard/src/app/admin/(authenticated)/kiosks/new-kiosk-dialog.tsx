"use client"

import * as React from "react"
import { toast } from "sonner"
import { CopyIcon, PlusIcon } from "lucide-react"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
import { RevenueShareInput } from "@/components/dashboard/revenue-share-input"
import { useCreateKiosk, type CreateKioskResult } from "@/lib/api/hooks/use-kiosks"
import { ApiError } from "@/lib/api/client"
import { emailSchema, nameSchema, revenueShareSchema } from "@/lib/validation/schemas"

type StepKey = "business" | "revenue" | "owner" | "reveal"

const STEP_INFO: Record<StepKey, { title: string; description: string }> = {
  business: { title: "Business info", description: "Who is this kiosk business?" },
  revenue: { title: "Revenue share", description: "What share does the kiosk keep?" },
  owner: { title: "Kiosk owner", description: "Who signs in to manage this kiosk?" },
  reveal: { title: "Account created", description: "Share these credentials with the kiosk owner" },
}

const stepKeys: StepKey[] = ["business", "revenue", "owner", "reveal"]

const STEP_FIELDS: Partial<Record<StepKey, ("name" | "revenueSharePct" | "owner.name" | "owner.email")[]>> = {
  business: ["name"],
  revenue: ["revenueSharePct"],
  owner: ["owner.name", "owner.email"],
}

const newKioskSchema = z.object({
  name: nameSchema,
  revenueSharePct: revenueShareSchema,
  owner: z.object({
    name: nameSchema,
    email: emailSchema,
  }),
})

type NewKioskFormValues = z.infer<typeof newKioskSchema>

export function NewKioskDialog() {
  const [open, setOpen] = React.useState(false)
  const [step, setStep] = React.useState(0)
  const [result, setResult] = React.useState<CreateKioskResult | null>(null)
  const createKiosk = useCreateKiosk()

  const {
    register,
    control,
    handleSubmit,
    trigger,
    watch,
    reset: resetForm,
    formState: { errors, isSubmitting },
  } = useForm<NewKioskFormValues>({
    resolver: zodResolver(newKioskSchema),
    mode: "onTouched",
    reValidateMode: "onChange",
    defaultValues: { name: "", revenueSharePct: 30, owner: { name: "", email: "" } },
  })

  const stepKey = stepKeys[step]
  const isLastInputStep = stepKey === "owner"
  const name = watch("name")

  function reset() {
    setStep(0)
    setResult(null)
    resetForm()
  }

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) reset()
  }

  async function copyPassword(password: string) {
    try {
      await navigator.clipboard.writeText(password)
      toast.success("Password copied.")
    } catch {
      toast.error("Could not copy to clipboard.")
    }
  }

  async function handleContinue() {
    const fields = STEP_FIELDS[stepKey]
    if (fields && !(await trigger(fields))) return
    setStep(step + 1)
  }

  function onSubmit(values: NewKioskFormValues) {
    createKiosk.mutate(values, {
      onSuccess: (data) => {
        setResult(data)
        setStep(stepKeys.indexOf("reveal"))
      },
      onError: (error) =>
        toast.error(error instanceof ApiError ? error.message : "Could not create kiosk."),
    })
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <Button onClick={() => setOpen(true)} className="gap-1.5">
        <PlusIcon className="size-4" />
        New Kiosk
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{STEP_INFO[stepKey].title}</DialogTitle>
          <WizardStepDots count={stepKeys.length} current={step} steps={stepKeys.map((key) => STEP_INFO[key])} />
          <DialogDescription>{STEP_INFO[stepKey].description}</DialogDescription>
        </DialogHeader>

        <form
          className="flex flex-1 flex-col justify-between"
          onSubmit={
            isLastInputStep
              ? handleSubmit(onSubmit)
              : stepKey === "reveal"
                ? (e) => {
                    e.preventDefault()
                    handleOpenChange(false)
                  }
                : (e) => {
                    e.preventDefault()
                    handleContinue()
                  }
          }
          noValidate
        >
          <div className="flex flex-col gap-4 px-6">
            {stepKey === "business" && (
              <FormField label="Name" htmlFor="new-kiosk-name" error={errors.name?.message}>
                <Input id="new-kiosk-name" {...register("name")} />
              </FormField>
            )}

            {stepKey === "revenue" && (
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
            )}

            {stepKey === "owner" && (
              <FormGrid>
                <FormField label="Name" htmlFor="new-kiosk-owner-name" error={errors.owner?.name?.message}>
                  <Input id="new-kiosk-owner-name" {...register("owner.name")} />
                </FormField>
                <FormField
                  label="Owner email"
                  htmlFor="new-kiosk-owner-email"
                  hint="We'll generate a secure password and email it to them — you'll also see it once on the next screen. This also doubles as the kiosk's contact email."
                  error={errors.owner?.email?.message}
                >
                  <Input id="new-kiosk-owner-email" type="email" {...register("owner.email")} />
                </FormField>
              </FormGrid>
            )}

            {stepKey === "reveal" && result && (
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-2 rounded-lg border border-black/8 px-4 py-3">
                  <div>
                    <p className="text-sm text-muted-foreground">Name</p>
                    <p className="text-sm font-medium">{result.owner.name}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Email</p>
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
                <p className="text-sm text-muted-foreground">
                  We also emailed this to {result.owner.email}. They&apos;ll be asked to set a
                  new password the first time they log in.
                </p>
              </div>
            )}
          </div>

          <DialogFooter className="flex-row justify-end">
            {step > 0 && stepKey !== "reveal" && (
              <Button type="button" variant="outline" onClick={() => setStep(step - 1)}>
                Back
              </Button>
            )}
            <Button type="submit" disabled={isSubmitting}>
              {stepKey === "reveal"
                ? "Done"
                : isLastInputStep
                  ? isSubmitting
                    ? "Creating…"
                    : "Create kiosk"
                  : "Continue"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
