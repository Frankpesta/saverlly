"use client"

import * as React from "react"
import { useParams, useRouter } from "next/navigation"
import { toast } from "sonner"
import { Skeleton } from "@/components/ui/skeleton"
import { Input } from "@/components/ui/input"
import { EntityFormCard, EntityFormHeader } from "@/components/dashboard/entity-form-page"
import { FormField, FormSection } from "@/components/dashboard/form-section"
import { useKioskUsers, useUpdateKioskUser } from "@/lib/api/hooks/use-kiosk-users"
import { useKiosk } from "@/lib/api/hooks/use-kiosks"
import { useLocations } from "@/lib/api/hooks/use-locations"
import { ApiError } from "@/lib/api/client"

export default function EditKioskUserPage() {
  const { id: kioskId, userId } = useParams<{ id: string; userId: string }>()
  const router = useRouter()
  const backHref = `/admin/kiosks/${kioskId}`

  const { data: kiosk } = useKiosk(kioskId)
  const { data: users, isLoading, isError } = useKioskUsers(kioskId)
  const { data: locations } = useLocations()
  const updateUser = useUpdateKioskUser(kioskId)

  const user = users?.find((u) => u.id === userId)
  const kioskLocations = React.useMemo(
    () => (locations ?? []).filter((l) => l.kioskId === kioskId),
    [locations, kioskId],
  )

  const [name, setName] = React.useState("")
  const [managedLocationIds, setManagedLocationIds] = React.useState<string[]>([])
  const [initialized, setInitialized] = React.useState(false)

  // react-hook-form isn't used here since the two fields (name, a checkbox list) don't need
  // schema validation beyond "name isn't blank" — plain state matches what the dialog this
  // replaced did. Seeded once the user loads, since useKioskUsers resolves after mount.
  if (user && !initialized) {
    setName(user.name ?? "")
    setManagedLocationIds(user.managedLocationIds)
    setInitialized(true)
  }

  function toggleLocation(locationId: string) {
    setManagedLocationIds((prev) =>
      prev.includes(locationId) ? prev.filter((id) => id !== locationId) : [...prev, locationId],
    )
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    updateUser.mutate(
      { userId, patch: { name, managedLocationIds } },
      {
        onSuccess: () => {
          toast.success("User updated.")
          router.push(backHref)
        },
        onError: (error) =>
          toast.error(error instanceof ApiError ? error.message : "Could not update user."),
      },
    )
  }

  if (isError) {
    return <p className="text-sm text-destructive">Could not load this user.</p>
  }

  if (isLoading || !user) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-64 w-full max-w-2xl" />
      </div>
    )
  }

  return (
    <form className="flex flex-col gap-6" onSubmit={handleSubmit} noValidate>
      <EntityFormHeader
        backHref={backHref}
        backLabel={kiosk?.name ?? "Kiosk"}
        heading={`Edit ${user.name || user.email}`}
        description={
          user.role === "LOCATION_MANAGER"
            ? "Choose which locations this manager can access."
            : "Kiosk owners already have access to every location on this kiosk."
        }
      />

      <EntityFormCard
        cancelHref={backHref}
        submitLabel="Save changes"
        pendingLabel="Saving…"
        isPending={updateUser.isPending}
        submitDisabled={!name.trim()}
      >
        <FormSection>
          <FormField label="Name" htmlFor="edit-kiosk-user-name">
            <Input
              id="edit-kiosk-user-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </FormField>
        </FormSection>

        {user.role === "LOCATION_MANAGER" && (
          <FormSection label="Managed locations">
            {kioskLocations.length === 0 && (
              <p className="text-sm text-muted-foreground">This kiosk has no locations yet.</p>
            )}
            <div className="flex flex-col gap-1">
              {kioskLocations.map((location) => (
                <label
                  key={location.id}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
                >
                  <input
                    type="checkbox"
                    checked={managedLocationIds.includes(location.id)}
                    onChange={() => toggleLocation(location.id)}
                    className="size-4 rounded border-input accent-[var(--brand-teal)]"
                  />
                  {location.name}
                </label>
              ))}
            </div>
          </FormSection>
        )}
      </EntityFormCard>
    </form>
  )
}
