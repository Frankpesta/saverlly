"use client"

import { InlineQueryError } from "@/components/dashboard/query-state"

import * as React from "react"
import { SearchIcon } from "lucide-react"
import { toast } from "sonner"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { profileInitials } from "@/components/profile/avatar-upload"
import { proxiedImageUrl } from "@/lib/image-proxy"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { DeleteRowButton } from "@/components/dashboard/delete-row-button"
import { AddEmployeeDialog } from "./add-employee-dialog"
import {
  useAdminUsers,
  useDeleteAdminUser,
  useUpdateAdminUser,
} from "@/lib/api/hooks/use-admin-users"
import { useCurrentUser } from "@/lib/api/hooks/use-current-user"
import { ApiError } from "@/lib/api/client"

export function AdminTeamSection() {
  const { data: currentUser } = useCurrentUser()
  const { data: admins, isLoading, isError, refetch } = useAdminUsers()
  const updateAdmin = useUpdateAdminUser()
  const deleteAdmin = useDeleteAdminUser()
  const [query, setQuery] = React.useState("")

  const visible = React.useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return admins ?? []
    return (admins ?? []).filter((admin) =>
      [admin.name, admin.email].some((value) => value?.toLowerCase().includes(needle)),
    )
  }, [admins, query])

  function toggleDisabled(userId: string, disabled: boolean) {
    updateAdmin.mutate(
      { userId, patch: { disabled: !disabled } },
      {
        onError: (error) =>
          toast.error(error instanceof ApiError ? error.message : "Could not update employee."),
      },
    )
  }

  function handleDelete(userId: string) {
    deleteAdmin.mutate(userId, {
      onSuccess: () => toast.success("Employee removed."),
      onError: (error) =>
        toast.error(error instanceof ApiError ? error.message : "Could not remove employee."),
    })
  }

  return (
    <div className="flex flex-col gap-3">
      {isError && <InlineQueryError message="Could not load employees." onRetry={refetch} />}
      {isLoading && <Skeleton className="h-10 w-full" />}
      {!isLoading && admins && admins.length > 0 && (
        <div className="relative">
          <SearchIcon
            aria-hidden
            className="pointer-events-none absolute top-3 left-3 size-4 text-muted-foreground"
          />
          <Input
            type="search"
            aria-label="Search employees"
            placeholder="Search employees…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="pl-9"
          />
        </div>
      )}
      {!isLoading && admins && admins.length > 0 && visible.length === 0 && (
        <p className="text-center text-sm text-muted-foreground">No employees match your search.</p>
      )}
      {!isLoading &&
        visible.map((admin) => {
          const isSelf = admin.id === currentUser?.id
          return (
            <div
              key={admin.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-black/8 px-4 py-3"
            >
              <div className="flex min-w-0 items-center gap-3">
              {/* Their actual photo, matching the kiosk roster and the profile page, so a
                  teammate is recognisable rather than a line of text. */}
              <Avatar className="size-9">
                {admin.avatarUrl && (
                  <AvatarImage src={proxiedImageUrl(admin.avatarUrl)} alt={admin.name ?? admin.email} />
                )}
                <AvatarFallback className="text-xs font-semibold">
                  {profileInitials(admin.name, admin.email)}
                </AvatarFallback>
              </Avatar>
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate text-sm font-medium">
                  {admin.name || admin.email}
                  {isSelf && <span className="ml-1.5 text-xs text-muted-foreground">(you)</span>}
                </span>
                {admin.name && <span className="truncate text-xs text-muted-foreground">{admin.email}</span>}
              </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <span className="text-sm text-muted-foreground">
                  {admin.disabled ? "Disabled" : "Active"}
                </span>
                <Switch
                  checked={!admin.disabled}
                  onCheckedChange={() => toggleDisabled(admin.id, admin.disabled)}
                  disabled={updateAdmin.isPending || isSelf}
                  aria-label={`Toggle ${admin.email} access`}
                  className="mr-1"
                />
                {!isSelf && (
                  <DeleteRowButton
                    itemLabel={admin.email}
                    description="They will lose access to the admin console immediately. This can't be undone."
                    onConfirm={() => handleDelete(admin.id)}
                    isPending={deleteAdmin.isPending}
                  />
                )}
              </div>
            </div>
          )
        })}
      <AddEmployeeDialog />
    </div>
  )
}
