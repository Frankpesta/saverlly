"use client"

import Link from "next/link"
import { toast } from "sonner"
import { CrownIcon, PencilIcon, UserPlusIcon } from "lucide-react"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { DeleteRowButton } from "@/components/dashboard/delete-row-button"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { useKioskUsers, useUpdateKioskUser, useDeleteKioskUser } from "@/lib/api/hooks/use-kiosk-users"
import { ApiError } from "@/lib/api/client"
import type { KioskUser } from "@/lib/api/types"
import { cn } from "@/lib/utils"

export function KioskUsersSection({ kioskId }: { kioskId: string }) {
  const { data: users, isLoading, isError } = useKioskUsers(kioskId)
  const updateUser = useUpdateKioskUser(kioskId)
  const deleteUser = useDeleteKioskUser(kioskId)

  function toggleDisabled(userId: string, disabled: boolean) {
    updateUser.mutate(
      { userId, patch: { disabled: !disabled } },
      {
        onError: (error) =>
          toast.error(error instanceof ApiError ? error.message : "Could not update user."),
      },
    )
  }

  function handleDelete(userId: string) {
    deleteUser.mutate(userId, {
      onSuccess: () => toast.success("User deleted."),
      onError: (error) =>
        toast.error(error instanceof ApiError ? error.message : "Could not delete user."),
    })
  }

  // Owner pinned above managers under its own heading, rather than one flat list where the
  // only difference between the two roles was a badge's color and word. A kiosk has at most
  // one owner, so this is never more than a two-group split.
  const owners = users?.filter((u) => u.role === "KIOSK_OWNER") ?? []
  const managers = users?.filter((u) => u.role === "LOCATION_MANAGER") ?? []

  function renderUser(user: KioskUser) {
    const isOwner = user.role === "KIOSK_OWNER"
    return (
      <div
        key={user.id}
        className={cn(
          "flex items-center justify-between gap-3 rounded-lg border border-black/8 px-4 py-3 dark:border-white/10",
          // Disabled reads as visually receded, not just a different word next to an
          // otherwise-identical row.
          user.disabled && "opacity-55",
        )}
      >
        <div className="flex min-w-0 items-center gap-3">
          <span
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold uppercase",
              isOwner
                ? "bg-[var(--brand-teal-tint)] text-[var(--brand-teal)]"
                : "bg-muted text-muted-foreground",
            )}
          >
            {isOwner ? <CrownIcon className="size-4" /> : (user.name || user.email).slice(0, 1)}
          </span>
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="truncate text-sm font-medium">{user.name || user.email}</span>
            {user.name && <span className="truncate text-xs text-muted-foreground">{user.email}</span>}
            {!isOwner && user.managedLocationIds.length > 0 && (
              <span className="text-xs text-muted-foreground">
                {user.managedLocationIds.length} location{user.managedLocationIds.length === 1 ? "" : "s"}
              </span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <span className="text-sm text-muted-foreground">{user.disabled ? "Disabled" : "Active"}</span>
          <Switch
            checked={!user.disabled}
            onCheckedChange={() => toggleDisabled(user.id, user.disabled)}
            disabled={updateUser.isPending}
            aria-label={`Toggle ${user.email} access`}
            className="mr-1"
          />
          <Button asChild variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-foreground">
            <Link href={`/admin/kiosks/${kioskId}/users/${user.id}`} aria-label={`Edit ${user.email}`}>
              <PencilIcon className="size-3.5" />
            </Link>
          </Button>
          <DeleteRowButton
            itemLabel={user.email}
            description="They will be signed out and lose access immediately. This can't be undone."
            onConfirm={() => handleDelete(user.id)}
            isPending={deleteUser.isPending}
          />
        </div>
      </div>
    )
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Users</CardTitle>
        <Link href={`/admin/kiosks/${kioskId}/users/new`} className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5")}>
          <UserPlusIcon className="size-4" />
          Add user
        </Link>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {isError && <p className="text-sm text-destructive">Could not load users.</p>}
        {isLoading && <Skeleton className="h-10 w-full" />}
        {!isLoading && users?.length === 0 && (
          <p className="text-sm text-muted-foreground">No users on this kiosk yet.</p>
        )}

        {owners.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">Owner</span>
            <div className="flex flex-col gap-2">{owners.map(renderUser)}</div>
          </div>
        )}

        {managers.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">Managers</span>
            <div className="flex flex-col gap-2">{managers.map(renderUser)}</div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
