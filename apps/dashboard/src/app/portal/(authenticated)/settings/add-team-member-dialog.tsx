"use client"

import * as React from "react"
import { toast } from "sonner"
import { UserPlusIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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

/**
 * A kiosk-owner may only create LOCATION_MANAGER accounts under their own kiosk (never a peer
 * owner — kiosk-users.service.ts's assertRoleAssignable enforces this server-side), so unlike
 * the admin equivalent this dialog has no role picker at all.
 */
export function AddTeamMemberDialog({ kioskId }: { kioskId: string }) {
  const [open, setOpen] = React.useState(false)
  const [email, setEmail] = React.useState("")
  const [password, setPassword] = React.useState("")
  const createUser = useCreateKioskUser(kioskId)

  function reset() {
    setEmail("")
    setPassword("")
  }

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) reset()
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    createUser.mutate(
      { email, password, role: "LOCATION_MANAGER" },
      {
        onSuccess: () => {
          toast.success(`${email} was added.`)
          handleOpenChange(false)
        },
        onError: (error) =>
          toast.error(error instanceof ApiError ? error.message : "Could not add team member."),
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} className="gap-1.5">
        <UserPlusIcon className="size-4" />
        Add team member
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add team member</DialogTitle>
          <DialogDescription>
            Set an email and a temporary password — share it with them directly, there&apos;s no
            invite email yet. They&apos;ll be added as a location manager.
          </DialogDescription>
        </DialogHeader>

        <form className="flex flex-1 flex-col justify-between" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-4 px-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="team-member-email">Email</Label>
              <Input
                id="team-member-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="team-member-password">Temporary password</Label>
              <Input
                id="team-member-password"
                type="text"
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <p className="text-sm text-muted-foreground">At least 8 characters.</p>
            </div>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={createUser.isPending}>
              {createUser.isPending ? "Adding…" : "Add team member"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
