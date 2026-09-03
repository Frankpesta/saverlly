"use client"

import * as React from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { toast } from "sonner"
import { ArrowLeftIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { DeleteRowButton } from "@/components/dashboard/delete-row-button"
import { FormField, FormGrid } from "@/components/dashboard/form-section"
import { CityStateFields } from "@/components/dashboard/city-state-fields"
import { TagInput } from "@/components/dashboard/tag-input"
import { useDeleteLocation, useLocation, useUpdateLocation } from "@/lib/api/hooks/use-locations"
import { useCurrentUser } from "@/lib/api/hooks/use-current-user"
import { ApiError } from "@/lib/api/client"
import type { Location } from "@/lib/api/types"
import { nameSchema, zipSchema } from "@/lib/validation/schemas"
import { SetupCodesSection } from "./setup-codes-section"
import { LocationDevicesSection } from "./location-devices-section"

const locationEditSchema = z.object({
  name: nameSchema,
  address: z.string().trim().min(1, "Address is required"),
  city: z.string().trim().min(1, "City is required"),
  state: z.string().min(1, "Select a state"),
  zip: zipSchema,
  tags: z.array(z.string()),
})

type LocationEditFormValues = z.infer<typeof locationEditSchema>

export default function LocationDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { data: location, isLoading, isError } = useLocation(id)
  const { data: currentUser } = useCurrentUser()
  const isKioskOwner = currentUser?.role === "KIOSK_OWNER"
  const deleteLocation = useDeleteLocation()

  function handleDelete() {
    deleteLocation.mutate(id, {
      onSuccess: () => {
        toast.success("Location deleted.")
        router.push("/portal/locations")
      },
      onError: (error) =>
        toast.error(error instanceof ApiError ? error.message : "Could not delete location."),
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 border-b border-black/[0.09] dark:border-white/10 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link href="/portal/locations" className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeftIcon className="size-4" />
            Locations
          </Link>
          <p className="mt-5 text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">Location profile</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight">{location?.name ?? "Location"}</h2>
        </div>
        {location && isKioskOwner && (
          <DeleteRowButton
            variant="button"
            itemLabel={location.name}
            description="Its setup codes, devices, and all device activity history will be deleted too. This can't be undone."
            onConfirm={handleDelete}
            isPending={deleteLocation.isPending}
            ariaLabel={`Delete ${location.name}`}
          />
        )}
      </div>

      {isError && <p className="text-sm text-destructive">Could not load this location.</p>}
      {isLoading && <Skeleton className="h-64 w-full max-w-lg" />}

      {location && (
        <div className="grid grid-cols-1 items-start gap-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
          <Card>
            <CardHeader>
              <CardTitle>Location details</CardTitle>
            </CardHeader>
            <LocationEditForm key={location.id} location={location} />
          </Card>

          <SetupCodesSection locationId={location.id} />
          <LocationDevicesSection locationId={location.id} />
        </div>
      )}
    </div>
  )
}

function LocationEditForm({ location }: { location: Location }) {
  const updateLocation = useUpdateLocation(location.id)
  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LocationEditFormValues>({
    resolver: zodResolver(locationEditSchema),
    mode: "onTouched",
    reValidateMode: "onChange",
    defaultValues: {
      name: location.name,
      address: location.address,
      city: location.city,
      state: location.state,
      zip: location.zip ?? "",
      tags: location.tags,
    },
  })

  function onSubmit(values: LocationEditFormValues) {
    updateLocation.mutate(values, {
      onSuccess: () => toast.success("Location updated."),
      onError: (error) =>
        toast.error(error instanceof ApiError ? error.message : "Could not update location."),
    })
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="contents">
      <CardContent className="flex flex-col gap-4">
        <FormGrid>
          <FormField label="Name" htmlFor="loc-name" error={errors.name?.message}>
            <Input id="loc-name" {...register("name")} />
          </FormField>
          <FormField label="Address" htmlFor="loc-address" error={errors.address?.message}>
            <Input id="loc-address" {...register("address")} />
          </FormField>
        </FormGrid>
        <CityStateFields idPrefix="loc" control={control} cityName="city" stateName="state" />
        <FormField
          label="Zip"
          htmlFor="loc-zip"
          hint="US ZIP, ZIP+4, or a postal code with letters and dashes."
          error={errors.zip?.message}
        >
          <Controller
            name="zip"
            control={control}
            render={({ field, fieldState }) => (
              <Input
                id="loc-zip"
                value={field.value}
                onChange={(e) => field.onChange(e.target.value.toUpperCase().slice(0, 10))}
                onBlur={field.onBlur}
                maxLength={10}
                aria-invalid={!!fieldState.error}
              />
            )}
          />
        </FormField>
        <FormField label="Tags" htmlFor="loc-tags">
          <Controller
            name="tags"
            control={control}
            render={({ field }) => (
              <TagInput
                id="loc-tags"
                value={field.value}
                onChange={field.onChange}
                placeholder="mall, downtown, high-traffic"
              />
            )}
          />
        </FormField>
      </CardContent>
      <CardFooter>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Saving…" : "Save changes"}
        </Button>
      </CardFooter>
    </form>
  )
}
