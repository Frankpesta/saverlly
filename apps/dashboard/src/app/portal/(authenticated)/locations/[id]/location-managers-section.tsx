"use client"

import * as React from "react"
import Link from "next/link"
import { toast } from "sonner"
import { SearchIcon, UserPlusIcon, XIcon } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Combobox } from "@/components/ui/combobox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { profileInitials } from "@/components/profile/avatar-upload"
import { useKioskUsers, useUpdateKioskUser } from "@/lib/api/hooks/use-kiosk-users"
import { useCurrentUser } from "@/lib/api/hooks/use-current-user"
import { ApiError } from "@/lib/api/client"
import { proxiedImageUrl } from "@/lib/image-proxy"
import { cn } from "@/lib/utils"

/**
 * Who runs this location, managed from the location itself.
 *
 * Assigning a manager used to be reachable only from Settings > Team > pencil > a checkbox list
 * of every location, which is the wrong direction to work in when the question you are actually
 * asking is "who covers Downtown". Both directions write the same `managedLocationIds` array
 * through PATCH /kiosks/:kioskId/users/:id, so they stay consistent with each other.
 */
export function LocationManagersSection({
  locationId,
  locationName,
}: {
  locationId: string
  locationName: string
}) {
  const { data: currentUser } = useCurrentUser()
  const isKioskOwner = currentUser?.role === "KIOSK_OWNER"
  const kioskId = currentUser?.kioskId ?? ""
  // GET /kiosks/:id/users is ADMIN/KIOSK_OWNER only. A location manager would just get a 403.
  const { data: users, isLoading } = useKioskUsers(isKioskOwner ? kioskId : "")
  const updateUser = useUpdateKioskUser(kioskId)
  const [pendingId, setPendingId] = React.useState("")
  const [query, setQuery] = React.useState("")

  const managers = users?.filter((user) => user.role === "LOCATION_MANAGER") ?? []
  const rawAssigned = managers.filter((user) => user.managedLocationIds.includes(locationId))
  const unassigned = managers.filter((user) => !user.managedLocationIds.includes(locationId))
  const assigned = React.useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return rawAssigned
    return rawAssigned.filter((user) =>
      [user.name, user.email].some((value) => value?.toLowerCase().includes(needle)),
    )
  }, [rawAssigned, query])

  if (!isKioskOwner) return null

  function assign(userId: string) {
    const user = managers.find((candidate) => candidate.id === userId)
    if (!user) return
    updateUser.mutate(
      {
        userId,
        patch: { managedLocationIds: [...user.managedLocationIds, locationId] },
      },
      {
        onSuccess: () => {
          toast.success(`${user.name || user.email} now covers ${locationName}.`)
          setPendingId("")
        },
        onError: (error) =>
          toast.error(error instanceof ApiError ? error.message : "Could not assign that manager."),
      },
    )
  }

  function unassign(userId: string) {
    const user = managers.find((candidate) => candidate.id === userId)
    if (!user) return
    updateUser.mutate(
      {
        userId,
        patch: {
          managedLocationIds: user.managedLocationIds.filter((id) => id !== locationId),
        },
      },
      {
        onSuccess: () => toast.success(`${user.name || user.email} was removed from ${locationName}.`),
        onError: (error) =>
          toast.error(error instanceof ApiError ? error.message : "Could not remove that manager."),
      },
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Managers</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {isLoading && <Skeleton className="h-10 w-full" />}

        {!isLoading && rawAssigned.length > 5 && (
          <div className="relative">
            <SearchIcon
              aria-hidden
              className="pointer-events-none absolute top-3 left-3 size-4 text-muted-foreground"
            />
            <Input
              type="search"
              aria-label="Search assigned managers"
              placeholder="Search assigned managers…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="pl-9"
            />
          </div>
        )}

        {!isLoading && rawAssigned.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Nobody is assigned to this location yet. You can still see it as the owner.
          </p>
        )}

        {!isLoading && rawAssigned.length > 0 && assigned.length === 0 && (
          <p className="text-sm text-muted-foreground">No assigned managers match your search.</p>
        )}

        {assigned.length > 0 && (
          <div className="flex flex-col gap-2">
            {assigned.map((user) => (
              <div
                key={user.id}
                className={cn(
                  "flex items-center gap-3 rounded-lg border border-black/8 px-3 py-2.5 dark:border-white/10",
                  user.disabled && "opacity-60",
                )}
              >
                <Avatar className="size-8">
                  {user.avatarUrl && (
                    <AvatarImage src={proxiedImageUrl(user.avatarUrl)} alt={user.name ?? user.email} />
                  )}
                  <AvatarFallback className="text-xs">
                    {profileInitials(user.name, user.email)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex min-w-0 flex-1 flex-col">
                  <Link
                    href={`/portal/settings/team/${user.id}`}
                    className="truncate text-sm font-medium hover:underline"
                  >
                    {user.name || user.email}
                  </Link>
                  {user.name && (
                    <span className="truncate text-xs text-muted-foreground">{user.email}</span>
                  )}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => unassign(user.id)}
                  disabled={updateUser.isPending}
                  aria-label={`Remove ${user.email} from ${locationName}`}
                >
                  <XIcon className="size-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {!isLoading && unassigned.length > 0 && (
          <div className="flex flex-col gap-2 border-t border-black/[0.06] pt-4 dark:border-white/10">
            <Label htmlFor="assign-manager">Add a manager</Label>
            <div className="flex items-center gap-2">
              <Combobox
                id="assign-manager"
                className="flex-1"
                value={pendingId}
                onValueChange={setPendingId}
                placeholder="Pick a team member"
                searchPlaceholder="Search team..."
                options={unassigned.map((user) => ({
                  value: user.id,
                  label: user.name || user.email,
                }))}
              />
              <Button
                type="button"
                onClick={() => assign(pendingId)}
                disabled={!pendingId || updateUser.isPending}
              >
                {updateUser.isPending ? "Assigning…" : "Assign"}
              </Button>
            </div>
          </div>
        )}

        {!isLoading && managers.length === 0 && (
          <Link
            href="/portal/settings/team/new"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "w-fit gap-1.5")}
          >
            <UserPlusIcon className="size-4" />
            Add your first team member
          </Link>
        )}
      </CardContent>
    </Card>
  )
}
