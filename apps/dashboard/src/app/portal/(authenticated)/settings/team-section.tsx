"use client"

import * as React from "react"
import { toast } from "sonner"
import { PencilIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { useKioskUsers, useUpdateKioskUser } from "@/lib/api/hooks/use-kiosk-users"
import { useLocations } from "@/lib/api/hooks/use-locations"
import { ApiError } from "@/lib/api/client"
import type { KioskUser } from "@/lib/api/types"
import { AddTeamMemberDialog } from "./add-team-member-dialog"

const ROLE_LABEL = {
  KIOSK_OWNER: "Kiosk owner",
  LOCATION_MANAGER: "Location manager",
} as const

export function TeamSection({ kioskId }: { kioskId: string }) {
  const { data: users, isLoading, isError } = useKioskUsers(kioskId)
  const updateUser = useUpdateKioskUser(kioskId)
  const [editing, setEditing] = React.useState<KioskUser | null>(null)

  function toggleDisabled(userId: string, disabled: boolean) {
    updateUser.mutate(
      { userId, patch: { disabled: !disabled } },
      {
        onError: (error) =>
          toast.error(error instanceof ApiError ? error.message : "Could not update team member."),
      },
    )
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Team</CardTitle>
        <AddTeamMemberDialog kioskId={kioskId} />
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {isError && <p className="text-sm text-destructive">Could not load team members.</p>}
        {isLoading && <Skeleton className="h-10 w-full" />}
        {!isLoading && users?.length === 0 && (
          <p className="text-sm text-muted-foreground">No team members yet.</p>
        )}
        {users?.map((user) => (
          <div
            key={user.id}
            className="flex items-center justify-between rounded-lg border border-black/8 px-4 py-3"
          >
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-medium">{user.name || user.email}</span>
              {user.name && <span className="text-xs text-muted-foreground">{user.email}</span>}
              <Badge variant="secondary" className="w-fit">
                {ROLE_LABEL[user.role]}
              </Badge>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-sm text-muted-foreground">
                {user.disabled ? "Disabled" : "Active"}
              </span>
              <Switch
                checked={!user.disabled}
                onCheckedChange={() => toggleDisabled(user.id, user.disabled)}
                disabled={updateUser.isPending || user.role === "KIOSK_OWNER"}
                aria-label={`Toggle ${user.email} access`}
                className="mr-1"
              />
              {user.role === "LOCATION_MANAGER" && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => setEditing(user)}
                  aria-label={`Edit ${user.email}`}
                >
                  <PencilIcon className="size-3.5" />
                </Button>
              )}
            </div>
          </div>
        ))}
      </CardContent>

      {editing && (
        <EditTeamMemberDialog
          kioskId={kioskId}
          user={editing}
          onOpenChange={(open) => !open && setEditing(null)}
        />
      )}
    </Card>
  )
}

function EditTeamMemberDialog({
  kioskId,
  user,
  onOpenChange,
}: {
  kioskId: string
  user: KioskUser
  onOpenChange: (open: boolean) => void
}) {
  const { data: locations } = useLocations()
  const [managedLocationIds, setManagedLocationIds] = React.useState(user.managedLocationIds)
  const updateUser = useUpdateKioskUser(kioskId)

  function toggleLocation(locationId: string) {
    setManagedLocationIds((prev) =>
      prev.includes(locationId) ? prev.filter((id) => id !== locationId) : [...prev, locationId],
    )
  }

  function handleSave() {
    updateUser.mutate(
      { userId: user.id, patch: { managedLocationIds } },
      {
        onSuccess: () => {
          toast.success("Team member updated.")
          onOpenChange(false)
        },
        onError: (error) =>
          toast.error(error instanceof ApiError ? error.message : "Could not update team member."),
      },
    )
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit {user.name || user.email}</DialogTitle>
          <DialogDescription>Choose which locations this manager can access.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1 px-7 pb-1">
          {locations?.length === 0 && (
            <p className="text-sm text-muted-foreground">You have no locations yet.</p>
          )}
          {locations?.map((location) => (
            <label
              key={location.id}
              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
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
        <DialogFooter className="px-7 pb-7">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSave} disabled={updateUser.isPending}>
            {updateUser.isPending ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
