"use client"

import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { useKioskUsers, useUpdateKioskUser } from "@/lib/api/hooks/use-kiosk-users"
import { ApiError } from "@/lib/api/client"
import { AddKioskUserSheet } from "./add-kiosk-user-sheet"

const ROLE_LABEL = {
  KIOSK_OWNER: "Kiosk owner",
  LOCATION_MANAGER: "Location manager",
} as const

export function KioskUsersSection({ kioskId }: { kioskId: string }) {
  const { data: users, isLoading, isError } = useKioskUsers(kioskId)
  const updateUser = useUpdateKioskUser(kioskId)

  function toggleDisabled(userId: string, disabled: boolean) {
    updateUser.mutate(
      { userId, patch: { disabled: !disabled } },
      {
        onError: (error) =>
          toast.error(error instanceof ApiError ? error.message : "Could not update user."),
      },
    )
  }

  return (
    <Card className="w-full max-w-lg">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Users</CardTitle>
        <AddKioskUserSheet kioskId={kioskId} />
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {isError && <p className="text-sm text-destructive">Could not load users.</p>}
        {isLoading && <Skeleton className="h-10 w-full" />}
        {!isLoading && users?.length === 0 && (
          <p className="text-sm text-muted-foreground">No users on this kiosk yet.</p>
        )}
        {users?.map((user) => (
          <div
            key={user.id}
            className="flex items-center justify-between rounded-xl border border-black/8 px-4 py-3"
          >
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-medium">{user.email}</span>
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
                disabled={updateUser.isPending}
                aria-label={`Toggle ${user.email} access`}
              />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
