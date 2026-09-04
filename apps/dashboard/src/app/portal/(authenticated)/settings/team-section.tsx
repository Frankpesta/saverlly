"use client"

import * as React from "react"
import Link from "next/link"
import { toast } from "sonner"
import { CrownIcon, PencilIcon, UserPlusIcon } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { SettingsSection } from "@/components/settings/settings-section"
import { profileInitials } from "@/components/profile/avatar-upload"
import { useKioskUsers, useUpdateKioskUser } from "@/lib/api/hooks/use-kiosk-users"
import { useLocations } from "@/lib/api/hooks/use-locations"
import { ApiError } from "@/lib/api/client"
import { proxiedImageUrl } from "@/lib/image-proxy"
import type { KioskUser } from "@/lib/api/types"
import { cn } from "@/lib/utils"

export function TeamSection({ kioskId }: { kioskId: string }) {
  const { data: users, isLoading, isError } = useKioskUsers(kioskId)
  const { data: locations } = useLocations()
  const updateUser = useUpdateKioskUser(kioskId)

  const locationNameById = React.useMemo(() => {
    const map = new Map<string, string>()
    for (const location of locations ?? []) map.set(location.id, location.name)
    return map
  }, [locations])

  // Owner first, then managers. They used to differ only by the word inside a badge, which is
  // not a difference you can see across a list.
  const owners = users?.filter((user) => user.role === "KIOSK_OWNER") ?? []
  const managers = users?.filter((user) => user.role === "LOCATION_MANAGER") ?? []

  function toggleDisabled(user: KioskUser) {
    updateUser.mutate(
      { userId: user.id, patch: { disabled: !user.disabled } },
      {
        onError: (error) =>
          toast.error(error instanceof ApiError ? error.message : "Could not update team member."),
      },
    )
  }

  function renderRow(user: KioskUser) {
    const isOwner = user.role === "KIOSK_OWNER"
    const managed = user.managedLocationIds
      .map((id) => locationNameById.get(id))
      .filter(Boolean) as string[]

    return (
      <div
        key={user.id}
        className={cn(
          "flex items-center gap-3 rounded-lg border border-black/8 px-4 py-3 dark:border-white/10",
          user.disabled && "opacity-60",
        )}
      >
        <Avatar className={cn("size-9", isOwner && "ring-1 ring-[var(--brand-teal)]")}>
          {user.avatarUrl && (
            <AvatarImage src={proxiedImageUrl(user.avatarUrl)} alt={user.name ?? user.email} />
          )}
          <AvatarFallback
            className={
              isOwner
                ? "bg-[var(--brand-teal-tint)] text-xs font-semibold text-[var(--brand-teal)]"
                : "text-xs"
            }
          >
            {profileInitials(user.name, user.email)}
          </AvatarFallback>
        </Avatar>

        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex items-center gap-1.5 truncate text-sm font-medium">
            {user.name || user.email}
            {isOwner && <CrownIcon className="size-3.5 shrink-0 text-[var(--brand-teal)]" />}
          </span>
          {user.name && (
            <span className="truncate text-xs text-muted-foreground">{user.email}</span>
          )}
          {!isOwner && (
            <span className="truncate text-xs text-muted-foreground">
              {managed.length === 0 ? "No locations assigned" : managed.join(", ")}
            </span>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {user.disabled && <Badge variant="secondary">Inactive</Badge>}
          <Switch
            checked={!user.disabled}
            onCheckedChange={() => toggleDisabled(user)}
            disabled={updateUser.isPending || isOwner}
            aria-label={`Toggle ${user.email} access`}
          />
          {!isOwner && (
            <Link
              href={`/portal/settings/team/${user.id}`}
              className={cn(
                buttonVariants({ variant: "ghost", size: "icon-sm" }),
                "text-muted-foreground hover:text-foreground",
              )}
              aria-label={`Edit ${user.email}`}
            >
              <PencilIcon className="size-3.5" />
            </Link>
          )}
        </div>
      </div>
    )
  }

  return (
    <SettingsSection title="Team">
      <div className="flex flex-col gap-5">
        {isError && <p className="text-sm text-destructive">Could not load team members.</p>}
        {isLoading && <Skeleton className="h-16 w-full" />}

        {owners.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="text-eyebrow text-muted-foreground uppercase">Owner</span>
            {owners.map(renderRow)}
          </div>
        )}

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-eyebrow text-muted-foreground uppercase">
              Location managers
            </span>
            <Link
              href="/portal/settings/team/new"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5")}
            >
              <UserPlusIcon className="size-4" />
              Add team member
            </Link>
          </div>
          {!isLoading && managers.length === 0 && (
            <p className="rounded-lg border border-dashed border-black/12 px-4 py-6 text-center text-sm text-muted-foreground dark:border-white/12">
              No location managers yet.
            </p>
          )}
          {managers.map(renderRow)}
        </div>
      </div>
    </SettingsSection>
  )
}
