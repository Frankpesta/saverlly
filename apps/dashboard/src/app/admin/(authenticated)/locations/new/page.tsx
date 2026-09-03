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
import { CityStateFields } from "@/components/dashboard/city-state-fields"
import { TagInput } from "@/components/dashboard/tag-input"
import { useCreateLocation } from "@/lib/api/hooks/use-locations"
import { useKiosks } from "@/lib/api/hooks/use-kiosks"
import { ApiError } from "@/lib/api/client"
import { nameSchema, zipSchema } from "@/lib/validation/schemas"

const newLocationSchema = z.object({
  kioskId: z.string().min(1, "Select a kiosk"),
  name: nameSchema,
  address: z.string().trim().min(1, "Address is required"),
  city: z.string().trim().min(1, "City is required"),
  state: z.string().min(1, "Select a state"),
  zip: zipSchema,
  tags: z.array(z.string()),
})

type NewLocationFormValues = z.infer<typeof newLocationSchema>

export default function NewLocationPage() {
  const router = useRouter()
  const createLocation = useCreateLocation()
  const { data: kiosks } = useKiosks()

  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<NewLocationFormValues>({
    resolver: zodResolver(newLocationSchema),
    mode: "onTouched",
    reValidateMode: "onChange",
    defaultValues: { kioskId: "", name: "", address: "", city: "", state: "", zip: "", tags: [] },
  })

  function onSubmit(values: NewLocationFormValues) {
    createLocation.mutate(
      { ...values, tags: values.tags.length ? values.tags : undefined },
      {
        onSuccess: (location) => {
          toast.success(`${values.name} was created.`)
          router.push(`/admin/locations/${location.id}`)
        },
        onError: (error) =>
          toast.error(error instanceof ApiError ? error.message : "Could not create location."),
      },
    )
  }

  return (
    <form className="flex flex-col gap-6" onSubmit={handleSubmit(onSubmit)} noValidate>
      <EntityFormHeader backHref="/admin/locations" backLabel="Locations" heading="New location" />

      <EntityFormCard
        cancelHref="/admin/locations"
        submitLabel="Create location"
        pendingLabel="Creating…"
        isPending={isSubmitting}
      >
        <FormSection label="Where is it?" description="Which kiosk, and the business address.">
          <FormGrid>
            <FormField label="Kiosk" htmlFor="new-location-kiosk" error={errors.kioskId?.message}>
              <Controller
                name="kioskId"
                control={control}
                render={({ field, fieldState }) => (
                  <Combobox
                    id="new-location-kiosk"
                    value={field.value}
                    onValueChange={field.onChange}
                    placeholder="Select a kiosk"
                    searchPlaceholder="Search kiosks..."
                    options={kiosks?.map((kiosk) => ({ value: kiosk.id, label: kiosk.name })) ?? []}
                    aria-invalid={!!fieldState.error}
                  />
                )}
              />
            </FormField>
            <FormField label="Name" htmlFor="new-location-name" error={errors.name?.message}>
              <Input id="new-location-name" {...register("name")} />
            </FormField>
          </FormGrid>
          <FormField label="Address" htmlFor="new-location-address" error={errors.address?.message}>
            <Input id="new-location-address" {...register("address")} />
          </FormField>
          <CityStateFields idPrefix="new-location" control={control} cityName="city" stateName="state" />
          <FormField
            label="Zip"
            htmlFor="new-location-zip"
            hint="US ZIP, ZIP+4, or a postal code with letters and dashes."
            error={errors.zip?.message}
          >
            <Controller
              name="zip"
              control={control}
              render={({ field, fieldState }) => (
                <Input
                  id="new-location-zip"
                  value={field.value}
                  onChange={(e) => field.onChange(e.target.value.toUpperCase().slice(0, 10))}
                  onBlur={field.onBlur}
                  maxLength={10}
                  aria-invalid={!!fieldState.error}
                />
              )}
            />
          </FormField>
        </FormSection>

        <FormSection label="Details" description="Optional. Tags help with future targeting.">
          <FormField
            label="Tags"
            htmlFor="new-location-tags"
            hint="Press comma or Enter to add a tag."
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
        </FormSection>
      </EntityFormCard>
    </form>
  )
}
