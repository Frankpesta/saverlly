"use client"

import Link from "next/link"
import { toast } from "sonner"
import { UserPlusIcon } from "lucide-react"
import { buttonVariants } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { DeleteRowButton } from "@/components/dashboard/delete-row-button"
import {
  useAdminUsers,
  useDeleteAdminUser,
  useUpdateAdminUser,
} from "@/lib/api/hooks/use-admin-users"
import { useCurrentUser } from "@/lib/api/hooks/use-current-user"
import { ApiError } from "@/lib/api/client"
import { cn } from "@/lib/utils"

export function AdminTeamSection() {
  const { data: currentUser } = useCurrentUser()
  const { data: admins, isLoading, isError } = useAdminUsers()
  const updateAdmin = useUpdateAdminUser()
  const deleteAdmin = useDeleteAdminUser()

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
      {isError && <p className="text-sm text-destructive">Could not load employees.</p>}
      {isLoading && <Skeleton className="h-10 w-full" />}
      {!isLoading &&
        admins?.map((admin) => {
          const isSelf = admin.id === currentUser?.id
          return (
            <div
              key={admin.id}
              className="flex items-center justify-between rounded-lg border border-black/8 px-4 py-3"
            >
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium">
                  {admin.name || admin.email}
                  {isSelf && <span className="ml-1.5 text-xs text-muted-foreground">(you)</span>}
                </span>
                {admin.name && <span className="text-xs text-muted-foreground">{admin.email}</span>}
              </div>
              <div className="flex items-center gap-1">
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
      <Link
        href="/admin/settings/employees/new"
        className={cn(buttonVariants({ variant: "outline" }), "w-full gap-1.5")}
      >
        <UserPlusIcon className="size-4" />
        Add employee
      </Link>
    </div>
  )
}
