"use client"

import * as React from "react"
import { useParams, useRouter } from "next/navigation"
import { toast } from "sonner"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { KeyRoundIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { DeleteRowButton } from "@/components/dashboard/delete-row-button"
import { EntityFormCard, EntityFormHeader } from "@/components/dashboard/entity-form-page"
import { FormField, FormGrid, FormSection } from "@/components/dashboard/form-section"
import { LocationPickerField } from "@/components/dashboard/location-picker-field"
import { CredentialReveal } from "@/components/dashboard/credential-reveal"
import {
  useDeleteKioskUser,
  useKioskUsers,
  useResendKioskUserPassword,
  useUpdateKioskUser,
} from "@/lib/api/hooks/use-kiosk-users"
import { useCurrentUser } from "@/lib/api/hooks/use-current-user"
import { ApiError } from "@/lib/api/client"
import type { KioskUser } from "@/lib/api/types"
import { emailSchema, nameSchema } from "@/lib/validation/schemas"

const teamMemberSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  managedLocationIds: z.array(z.string()),
})

type TeamMemberFormValues = z.infer<typeof teamMemberSchema>

export default function EditTeamMemberPage() {
  const { id } = useParams<{ id: string }>()
  const { data: currentUser } = useCurrentUser()
  const kioskId = currentUser?.kioskId ?? ""
  const { data: users, isLoading, isError } = useKioskUsers(kioskId)
  const member = users?.find((user) => user.id === id)

  return (
    <div className="flex flex-col gap-6">
      {isError && <p className="text-sm text-destructive">Could not load this team member.</p>}
      {isLoading && (
        <>
          <Skeleton className="h-16 w-64" />
          <Skeleton className="h-96 w-full max-w-2xl rounded-lg" />
        </>
      )}
      {!isLoading && !member && !isError && (
        <>
          <EntityFormHeader
            backHref="/portal/settings"
            backLabel="Settings"
            heading="Team member not found"
          />
          <p className="text-sm text-muted-foreground">
            They may have already been removed from this kiosk.
          </p>
        </>
      )}
      {member && <TeamMemberEditor key={member.id} kioskId={kioskId} member={member} />}
    </div>
  )
}

function TeamMemberEditor({ kioskId, member }: { kioskId: string; member: KioskUser }) {
  const router = useRouter()
  const updateUser = useUpdateKioskUser(kioskId)
  const deleteUser = useDeleteKioskUser(kioskId)
  const resendPassword = useResendKioskUserPassword(kioskId)
  const [freshPassword, setFreshPassword] = React.useState<string | null>(null)

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<TeamMemberFormValues>({
    resolver: zodResolver(teamMemberSchema),
    mode: "onTouched",
    reValidateMode: "onChange",
    defaultValues: {
      name: member.name ?? "",
      email: member.email,
      managedLocationIds: member.managedLocationIds,
    },
  })

  function onSubmit(values: TeamMemberFormValues) {
    updateUser.mutate(
      { userId: member.id, patch: values },
      {
        onSuccess: (updated) => {
          toast.success("Team member updated.")
          reset({
            name: updated.name ?? "",
            email: updated.email,
            managedLocationIds: updated.managedLocationIds,
          })
        },
        onError: (error) =>
          toast.error(error instanceof ApiError ? error.message : "Could not update team member."),
      },
    )
  }

  function toggleDisabled() {
    updateUser.mutate(
      { userId: member.id, patch: { disabled: !member.disabled } },
      {
        onSuccess: () =>
          toast.success(member.disabled ? "Access restored." : "Access suspended."),
        onError: (error) =>
          toast.error(error instanceof ApiError ? error.message : "Could not update access."),
      },
    )
  }

  function handleResend() {
    resendPassword.mutate(member.id, {
      onSuccess: (data) => {
        setFreshPassword(data.generatedPassword)
        toast.success("New password issued and emailed.")
      },
      onError: (error) =>
        toast.error(error instanceof ApiError ? error.message : "Could not reset the password."),
    })
  }

  function handleDelete() {
    deleteUser.mutate(member.id, {
      onSuccess: () => {
        toast.success("Team member removed.")
        router.push("/portal/settings")
      },
      onError: (error) =>
        toast.error(error instanceof ApiError ? error.message : "Could not remove team member."),
    })
  }

  return (
    <>
      <EntityFormHeader
        backHref="/portal/settings"
        backLabel="Settings"
        heading={member.name || member.email}
        headerActions={
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                {member.disabled ? "Inactive" : "Active"}
              </span>
              <Switch
                checked={!member.disabled}
                onCheckedChange={toggleDisabled}
                disabled={updateUser.isPending}
                aria-label={`Toggle ${member.email} access`}
              />
            </div>
            <DeleteRowButton
              variant="button"
              itemLabel={member.name || member.email}
              description="They lose access to this kiosk immediately. Locations, devices and announcements are not affected."
              onConfirm={handleDelete}
              isPending={deleteUser.isPending}
            />
          </div>
        }
      />

      <form className="flex flex-col gap-6" onSubmit={handleSubmit(onSubmit)} noValidate>
        <EntityFormCard
          cancelHref="/portal/settings"
          submitLabel="Save changes"
          pendingLabel="Saving…"
          isPending={isSubmitting}
        >
          <FormSection label="Details">
            <FormGrid>
              <FormField label="Name" htmlFor="team-member-name" error={errors.name?.message}>
                <Input id="team-member-name" {...register("name")} />
              </FormField>
              <FormField
                label="Email"
                htmlFor="team-member-email"
                hint="This is the address they sign in with."
                error={errors.email?.message}
              >
                <Input id="team-member-email" type="email" {...register("email")} />
              </FormField>
            </FormGrid>
          </FormSection>

          <FormSection label="Locations" description="What this manager can see.">
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
          </FormSection>
        </EntityFormCard>
      </form>

      <Card className="max-w-2xl">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Password</CardTitle>
          {member.mustChangePassword && (
            <Badge variant="secondary">Has not signed in yet</Badge>
          )}
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            {member.mustChangePassword
              ? "They are still on the password generated for them. If it never arrived, issue a new one and read it out."
              : "They have set their own password. Issuing a new one replaces it and makes them choose again on next sign-in."}
          </p>
          <Button
            type="button"
            variant="outline"
            className="w-fit gap-1.5"
            onClick={handleResend}
            disabled={resendPassword.isPending}
          >
            <KeyRoundIcon className="size-4" />
            {resendPassword.isPending ? "Issuing…" : "Issue a new password"}
          </Button>
          {freshPassword && (
            <CredentialReveal email={member.email} password={freshPassword} />
          )}
        </CardContent>
      </Card>
    </>
  )
}
