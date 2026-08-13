"use client"

import * as React from "react"
import { toast } from "sonner"
import { UserPlusIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { useCreateKioskUser } from "@/lib/api/hooks/use-kiosk-users"
import { ApiError } from "@/lib/api/client"
import type { KioskAssignableRole } from "@/lib/api/types"

export function AddKioskUserDialog({ kioskId }: { kioskId: string }) {
  const [open, setOpen] = React.useState(false)
  const [email, setEmail] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [role, setRole] = React.useState<KioskAssignableRole>("KIOSK_OWNER")
  const createUser = useCreateKioskUser(kioskId)

  function reset() {
    setEmail("")
    setPassword("")
    setRole("KIOSK_OWNER")
  }

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) reset()
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    createUser.mutate(
      { email, password, role },
      {
        onSuccess: () => {
          toast.success(`${email} was added.`)
          handleOpenChange(false)
        },
        onError: (error) =>
          toast.error(error instanceof ApiError ? error.message : "Could not add user."),
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} className="gap-1.5">
        <UserPlusIcon className="size-4" />
        Add user
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add user</DialogTitle>
          <DialogDescription>
            Set an email and a temporary password — share it with them directly, there&apos;s no
            invite email yet.
          </DialogDescription>
        </DialogHeader>

        <form className="flex flex-1 flex-col justify-between" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-4 px-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="add-user-email">Email</Label>
              <Input
                id="add-user-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="add-user-password">Temporary password</Label>
              <Input
                id="add-user-password"
                type="text"
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <p className="text-sm text-muted-foreground">At least 8 characters.</p>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="add-user-role">Role</Label>
              <Select value={role} onValueChange={(v) => setRole(v as KioskAssignableRole)}>
                <SelectTrigger id="add-user-role" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="KIOSK_OWNER">Kiosk owner</SelectItem>
                  <SelectItem value="LOCATION_MANAGER">Location manager</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={createUser.isPending}>
              {createUser.isPending ? "Adding…" : "Add user"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
