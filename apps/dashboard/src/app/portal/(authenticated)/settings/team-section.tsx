"use client"

import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { useKioskUsers, useUpdateKioskUser } from "@/lib/api/hooks/use-kiosk-users"
import { ApiError } from "@/lib/api/client"
import { AddTeamMemberDialog } from "./add-team-member-dialog"

const ROLE_LABEL = {
  KIOSK_OWNER: "Kiosk owner",
  LOCATION_MANAGER: "Location manager",
} as const

export function TeamSection({ kioskId }: { kioskId: string }) {
  const { data: users, isLoading, isError } = useKioskUsers(kioskId)
  const updateUser = useUpdateKioskUser(kioskId)

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
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                {user.disabled ? "Disabled" : "Active"}
              </span>
              <Switch
                checked={!user.disabled}
                onCheckedChange={() => toggleDisabled(user.id, user.disabled)}
                disabled={updateUser.isPending || user.role === "KIOSK_OWNER"}
                aria-label={`Toggle ${user.email} access`}
              />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
