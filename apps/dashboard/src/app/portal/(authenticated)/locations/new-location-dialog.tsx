"use client"

import * as React from "react"
import { toast } from "sonner"
import { PlusIcon } from "lucide-react"
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
import { CityStateFields } from "@/components/dashboard/city-state-fields"
import { TagInput } from "@/components/dashboard/tag-input"
import { useCreateLocation } from "@/lib/api/hooks/use-locations"
import { ApiError } from "@/lib/api/client"
import { nameSchema, zipSchema } from "@/lib/validation/schemas"

const STEPS = [
  { title: "Where is it?", description: "The location's business address." },
  { title: "Details", description: "Tags help with future targeting — optional." },
] as const

const STEP_0_FIELDS = ["name", "address", "city", "state", "zip"] as const

const newLocationSchema = z.object({
  name: nameSchema,
  address: z.string().trim().min(1, "Address is required"),
  city: z.string().trim().min(1, "City is required"),
  state: z.string().min(1, "Select a state"),
  zip: zipSchema,
  tags: z.array(z.string()),
})

type NewLocationFormValues = z.infer<typeof newLocationSchema>

export function NewLocationDialog() {
  const [open, setOpen] = React.useState(false)
  const [step, setStep] = React.useState(0)
  const createLocation = useCreateLocation()

  const {
    register,
    control,
    handleSubmit,
    trigger,
    reset: resetForm,
    formState: { errors, isSubmitting },
  } = useForm<NewLocationFormValues>({
    resolver: zodResolver(newLocationSchema),
    mode: "onTouched",
    reValidateMode: "onChange",
    defaultValues: { name: "", address: "", city: "", state: "", zip: "", tags: [] },
  })

  function reset() {
    setStep(0)
    resetForm()
  }

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) reset()
  }

  async function handleContinue() {
    if (await trigger(STEP_0_FIELDS)) setStep(1)
  }

  function onSubmit(values: NewLocationFormValues) {
    createLocation.mutate(
      { ...values, tags: values.tags.length ? values.tags : undefined },
      {
        onSuccess: () => {
          toast.success(`${values.name} was created.`)
          handleOpenChange(false)
        },
        onError: (error) =>
          toast.error(error instanceof ApiError ? error.message : "Could not create location."),
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <Button onClick={() => setOpen(true)} className="gap-1.5">
        <PlusIcon className="size-4" />
        New Location
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{STEPS[step].title}</DialogTitle>
          <WizardStepDots count={STEPS.length} current={step} steps={STEPS} />
          <DialogDescription>{STEPS[step].description}</DialogDescription>
        </DialogHeader>

        <form
          className="flex flex-1 flex-col justify-between"
          onSubmit={
            step === 0
              ? (e) => {
                  e.preventDefault()
                  handleContinue()
                }
              : handleSubmit(onSubmit)
          }
          noValidate
        >
          <div className="flex flex-col gap-4 px-6">
            {step === 0 && (
              <>
                <FormGrid>
                  <FormField label="Name" htmlFor="new-location-name" error={errors.name?.message}>
                    <Input id="new-location-name" {...register("name")} />
                  </FormField>
                  <FormField label="Address" htmlFor="new-location-address" error={errors.address?.message}>
                    <Input id="new-location-address" {...register("address")} />
                  </FormField>
                </FormGrid>
                <CityStateFields idPrefix="new-location" control={control} cityName="city" stateName="state" />
                <FormField
                  label="Zip"
                  htmlFor="new-location-zip"
                  hint="5-digit US ZIP code."
                  error={errors.zip?.message}
                >
                  <Controller
                    name="zip"
                    control={control}
                    render={({ field, fieldState }) => (
                      <Input
                        id="new-location-zip"
                        value={field.value}
                        onChange={(e) => field.onChange(e.target.value.replace(/\D/g, "").slice(0, 5))}
                        onBlur={field.onBlur}
                        inputMode="numeric"
                        maxLength={5}
                        aria-invalid={!!fieldState.error}
                      />
                    )}
                  />
                </FormField>
              </>
            )}

            {step === 1 && (
              <FormField
                label="Tags"
                htmlFor="new-location-tags"
                hint="Press comma or Enter to add a tag. Used for future ad targeting."
              >
                <Controller
                  name="tags"
                  control={control}
                  render={({ field }) => (
                    <TagInput
                      id="new-location-tags"
                      value={field.value}
                      onChange={field.onChange}
                      placeholder="mall, downtown, high-traffic"
                    />
                  )}
                />
              </FormField>
            )}
          </div>

          <DialogFooter className="flex-row justify-end">
            {step === 1 && (
              <Button type="button" variant="outline" onClick={() => setStep(0)}>
                Back
              </Button>
            )}
            <Button type="submit" disabled={isSubmitting}>
              {step === 0 ? "Continue" : isSubmitting ? "Creating…" : "Create location"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
