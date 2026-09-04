"use client"

import * as React from "react"
import Link from "next/link"
import { toast } from "sonner"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { KeyRoundIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { AvatarUpload, RemoveAvatarButton } from "@/components/profile/avatar-upload"
import { FormField } from "@/components/dashboard/form-section"
import { useCurrentUser, useUpdateCurrentUser } from "@/lib/api/hooks/use-current-user"
import { useKiosk } from "@/lib/api/hooks/use-kiosks"
import { useLocations } from "@/lib/api/hooks/use-locations"
import { usePublicPlatformSettings } from "@/lib/api/hooks/use-platform-settings"
import { ApiError } from "@/lib/api/client"
import { emailSchema, nameSchema } from "@/lib/validation/schemas"
import type { UserProfile } from "@/lib/api/types"
import { cn } from "@/lib/utils"

const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Admin",
  KIOSK_OWNER: "Kiosk owner",
  LOCATION_MANAGER: "Location manager",
}

const profileSchema = z.object({
  name: nameSchema,
  email: emailSchema,
})

type ProfileFormValues = z.infer<typeof profileSchema>

function memberSince(iso: string | undefined): string | null {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleDateString(undefined, { month: "long", year: "numeric" })
}

/**
 * The account's own page, for both consoles.
 *
 * Identity used to be a two-line row inside a Settings column with a pencil icon beside it, and
 * a profile photo had nowhere to live at all. This gives the person a page: the photo they
 * change by clicking it, the fields they own, and the facts they don't (role, workspace, access
 * scope) stated plainly rather than mixed in among editable inputs.
 *
 * One component serves admin and portal. What differs between them is role-driven, not
 * console-driven, so branching on the role keeps the two from drifting apart.
 */
export function ProfileView({ settingsHref }: { settingsHref: string }) {
  const { data: user, isLoading } = useCurrentUser()

  if (isLoading || !user) {
    return (
      <div className="flex flex-col gap-6">
        <h2 className="text-title">Profile</h2>
        <Skeleton className="h-40 w-full rounded-lg" />
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          <Skeleton className="h-72 w-full rounded-lg" />
          <Skeleton className="h-56 w-full rounded-lg" />
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-title">Profile</h2>

      <IdentityBand user={user} />

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <PersonalDetailsCard key={user.id} user={user} />
        <div className="flex flex-col gap-6">
          <AccessCard user={user} />
          <SecurityCard user={user} settingsHref={settingsHref} />
        </div>
      </div>
    </div>
  )
}

/** The hero row: photo, name, role, and the handful of facts worth reading at a glance. */
function IdentityBand({ user }: { user: UserProfile }) {
  const since = memberSince(user.createdAt)

  return (
    <div className="overflow-hidden rounded-lg border border-black/[0.07] bg-card dark:border-white/10">
      {/* A shallow brand wash behind the photo, so the band reads as one object rather than a
          card that happens to contain a circle. */}
      <div className="h-20 bg-[linear-gradient(120deg,var(--brand-teal-tint),transparent_65%)]" />
      <div className="flex flex-col gap-4 px-6 pb-6 sm:flex-row sm:items-end sm:gap-6">
        <AvatarUpload
          name={user.name}
          email={user.email}
          avatarUrl={user.avatarUrl}
          className="-mt-14 ring-4 ring-card dark:ring-card"
        />
        <div className="flex min-w-0 flex-1 flex-col gap-1 pb-1">
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="truncate text-title">{user.name || user.email}</h3>
            <Badge variant="secondary">{ROLE_LABEL[user.role] ?? user.role}</Badge>
          </div>
          <p className="truncate text-sm text-muted-foreground">{user.email}</p>
          {since && <p className="text-meta text-muted-foreground">On Saverlly since {since}</p>}
        </div>
        <div className="shrink-0 pb-1">
          {user.avatarUrl ? (
            <RemoveAvatarButton />
          ) : (
            <p className="text-meta text-muted-foreground">
              Click the circle to add a photo.
              <br />
              PNG, JPEG or WebP, up to 2MB.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

function PersonalDetailsCard({ user }: { user: UserProfile }) {
  const updateMe = useUpdateCurrentUser()
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    mode: "onTouched",
    reValidateMode: "onChange",
    defaultValues: { name: user.name ?? "", email: user.email },
  })

  function onSubmit(values: ProfileFormValues) {
    updateMe.mutate(values, {
      onSuccess: (updated) => {
        toast.success("Profile updated.")
        // Re-baseline so the form stops reporting itself dirty after a successful save.
        reset({ name: updated.name ?? "", email: updated.email })
      },
      onError: (error) =>
        toast.error(error instanceof ApiError ? error.message : "Could not update your profile."),
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Personal details</CardTitle>
      </CardHeader>
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="contents">
        <CardContent className="flex flex-col gap-4">
          <FormField label="Name" htmlFor="profile-name" error={errors.name?.message}>
            <Input id="profile-name" autoComplete="name" {...register("name")} />
          </FormField>
          <FormField
            label="Email"
            htmlFor="profile-email"
            hint="This is the address you sign in with."
            error={errors.email?.message}
          >
            <Input id="profile-email" type="email" autoComplete="email" {...register("email")} />
          </FormField>
        </CardContent>
        <CardFooter className="justify-end gap-2">
          <Button type="button" variant="outline" disabled={!isDirty} onClick={() => reset()}>
            Discard
          </Button>
          <Button type="submit" disabled={isSubmitting || !isDirty}>
            {isSubmitting ? "Saving…" : "Save changes"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  )
}

/** Role, workspace, and scope. Read-only on purpose: none of it is self-service. */
function AccessCard({ user }: { user: UserProfile }) {
  const isKioskOwner = user.role === "KIOSK_OWNER"
  // GET /kiosks/:id is ADMIN/KIOSK_OWNER only, so a location manager must not ask for it.
  const { data: kiosk } = useKiosk(isKioskOwner ? (user.kioskId ?? "") : "")
  const { data: locations } = useLocations()
  // Read at runtime from the backend, so an admin changing it takes effect without a redeploy.
  const { data: platformSettings } = usePublicPlatformSettings()
  const supportEmail = platformSettings?.supportEmail

  const managedCount = user.managedLocationIds?.length ?? 0

  const rows: Array<{ label: string; value: React.ReactNode }> = [
    { label: "Role", value: ROLE_LABEL[user.role] ?? user.role },
  ]

  if (user.role === "ADMIN") {
    rows.push({ label: "Scope", value: "Every kiosk on the platform" })
  } else {
    rows.push({ label: "Kiosk", value: kiosk?.name ?? (isKioskOwner ? "…" : "Your kiosk") })
    rows.push({
      label: "Locations",
      value:
        user.role === "LOCATION_MANAGER"
          ? managedCount === 0
            ? "None assigned yet"
            : `${managedCount} assigned`
          : `${locations?.length ?? 0} in this kiosk`,
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Access</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col">
        {rows.map((row, index) => (
          <div
            key={row.label}
            className={cn(
              "flex items-center justify-between gap-4 py-2.5",
              index > 0 && "border-t border-black/[0.06] dark:border-white/10",
            )}
          >
            <span className="text-sm text-muted-foreground">{row.label}</span>
            <span className="text-right text-sm font-medium">{row.value}</span>
          </div>
        ))}
        {user.role !== "ADMIN" && (
          <p className="mt-3 border-t border-black/[0.06] pt-3 text-sm text-muted-foreground dark:border-white/10">
            None of this is self-service.{" "}
            {supportEmail ? (
              <a href={`mailto:${supportEmail}`} className="text-[var(--brand-teal)] hover:underline">
                Ask your Saverlly admin
              </a>
            ) : (
              "Ask your Saverlly admin"
            )}{" "}
            to change it.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

function SecurityCard({ user, settingsHref }: { user: UserProfile; settingsHref: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Security</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {user.mustChangePassword ? (
          <p className="text-sm text-muted-foreground">
            You are still on the password that was generated for you. Set your own.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Your password is set. Change it whenever you need to.
          </p>
        )}
        <Link
          href={`${settingsHref}#password`}
          className={cn(buttonVariants({ variant: "outline" }), "w-fit gap-1.5")}
        >
          <KeyRoundIcon className="size-4" />
          Change password
        </Link>
      </CardContent>
    </Card>
  )
}
