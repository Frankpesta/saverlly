"use client"

import * as React from "react"
import { toast } from "sonner"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { UserCheckIcon } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { EntityCreatedPanel, EntityFormCard, EntityFormHeader } from "@/components/dashboard/entity-form-page"
import { FormField, FormGrid, FormSection } from "@/components/dashboard/form-section"
import { LocationPickerField } from "@/components/dashboard/location-picker-field"
import { CredentialReveal } from "@/components/dashboard/credential-reveal"
import { useCreateKioskUser, type CreateKioskUserResult } from "@/lib/api/hooks/use-kiosk-users"
import { useCurrentUser } from "@/lib/api/hooks/use-current-user"
import { ApiError } from "@/lib/api/client"
import { emailSchema, nameSchema } from "@/lib/validation/schemas"

const teamMemberSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  managedLocationIds: z.array(z.string()),
})

type TeamMemberFormValues = z.infer<typeof teamMemberSchema>

/**
 * A kiosk owner may only create LOCATION_MANAGER accounts under their own kiosk, never a peer
 * owner (kiosk-users.service.ts's assertRoleAssignable enforces this server-side), so unlike the
 * admin equivalent this form has no role picker at all.
 */
export default function NewTeamMemberPage() {
  const { data: currentUser, isLoading } = useCurrentUser()
  const kioskId = currentUser?.kioskId ?? ""
  const createUser = useCreateKioskUser(kioskId)
  const [result, setResult] = React.useState<CreateKioskUserResult | null>(null)

  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<TeamMemberFormValues>({
    resolver: zodResolver(teamMemberSchema),
    mode: "onTouched",
    reValidateMode: "onChange",
    defaultValues: { name: "", email: "", managedLocationIds: [] },
  })

  function onSubmit(values: TeamMemberFormValues) {
    createUser.mutate(
      {
        name: values.name,
        email: values.email,
        role: "LOCATION_MANAGER",
        // Assigning locations at create time, rather than needing a second trip through the
        // team list to open an edit form, which is how this used to work.
        ...(values.managedLocationIds.length
          ? { managedLocationIds: values.managedLocationIds }
          : {}),
      },
      {
        onSuccess: (data) => setResult(data),
        onError: (error) =>
          toast.error(error instanceof ApiError ? error.message : "Could not add team member."),
      },
    )
  }

  if (result) {
    return (
      <div className="flex flex-col gap-6">
        <EntityFormHeader
          backHref="/portal/settings"
          backLabel="Settings"
          heading="Team member added"
        />
        <EntityCreatedPanel
          icon={<UserCheckIcon className="size-6" />}
          title={result.user.name || result.user.email}
          description={`We emailed these details to ${result.user.email}. Copy the password now in case it doesn't arrive, since it isn't shown again.`}
          doneHref="/portal/settings"
          doneLabel="Back to settings"
        >
          <CredentialReveal
            email={result.user.email}
            password={result.generatedPassword}
          />
        </EntityCreatedPanel>
      </div>
    )
  }

  return (
    <form className="flex flex-col gap-6" onSubmit={handleSubmit(onSubmit)} noValidate>
      <EntityFormHeader
        backHref="/portal/settings"
        backLabel="Settings"
        heading="Add team member"
        description="They join as a location manager, with a password we generate and email to them."
      />

      <EntityFormCard
        cancelHref="/portal/settings"
        submitLabel="Add team member"
        pendingLabel="Adding…"
        isPending={isSubmitting}
        submitDisabled={!kioskId}
      >
        <FormSection label="Who are they?">
          <FormGrid>
            <FormField label="Name" htmlFor="team-member-name" error={errors.name?.message}>
              <Input id="team-member-name" {...register("name")} />
            </FormField>
            <FormField label="Email" htmlFor="team-member-email" error={errors.email?.message}>
              <Input id="team-member-email" type="email" {...register("email")} />
            </FormField>
          </FormGrid>
        </FormSection>

        <FormSection
          label="Locations"
          description="Pick what they can see. You can change this later."
        >
          {isLoading ? (
            <Skeleton className="h-24 w-full rounded-lg" />
          ) : (
            <Controller
              name="managedLocationIds"
              control={control}
              render={({ field }) => (
                <LocationPickerField
                  idPrefix="team-member"
                  value={field.value}
                  onChange={field.onChange}
                  newLocationHref="/portal/locations/new"
                />
              )}
            />
          )}
        </FormSection>
      </EntityFormCard>
    </form>
  )
}
