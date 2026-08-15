"use client"

import * as React from "react"
import { toast } from "sonner"
import { CopyIcon, UserPlusIcon } from "lucide-react"
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
import { useCreateKioskUser, type CreateKioskUserResult } from "@/lib/api/hooks/use-kiosk-users"
import { ApiError } from "@/lib/api/client"
import type { KioskAssignableRole } from "@/lib/api/types"

export function AddKioskUserDialog({ kioskId }: { kioskId: string }) {
  const [open, setOpen] = React.useState(false)
  const [email, setEmail] = React.useState("")
  const [role, setRole] = React.useState<KioskAssignableRole>("KIOSK_OWNER")
  const [result, setResult] = React.useState<CreateKioskUserResult | null>(null)
  const createUser = useCreateKioskUser(kioskId)

  function reset() {
    setEmail("")
    setRole("KIOSK_OWNER")
    setResult(null)
  }

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) reset()
  }

  async function copyPassword(password: string) {
    try {
      await navigator.clipboard.writeText(password)
      toast.success("Password copied.")
    } catch {
      toast.error("Could not copy to clipboard.")
    }
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    createUser.mutate(
      { email, role },
      {
        onSuccess: (data) => setResult(data),
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
        {!result ? (
          <>
            <DialogHeader>
              <DialogTitle>Add user</DialogTitle>
              <DialogDescription>
                We&apos;ll generate a secure password and email it to them.
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
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Account created</DialogTitle>
              <DialogDescription>Share these credentials with {result.user.email}</DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-4 px-4">
              <div className="flex flex-col gap-2 rounded-xl border border-black/8 px-4 py-3">
                <div>
                  <p className="text-sm text-muted-foreground">Email</p>
                  <p className="text-sm font-medium">{result.user.email}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Temporary password</p>
                  <div className="flex items-center gap-2">
                    <code className="rounded-md bg-muted px-2 py-1 font-mono text-sm tracking-wider">
                      {result.generatedPassword}
                    </code>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => copyPassword(result.generatedPassword)}
                      aria-label="Copy password"
                    >
                      <CopyIcon className="size-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                We also emailed this to {result.user.email}. They&apos;ll be asked to set a new
                password the first time they log in.
              </p>
            </div>

            <DialogFooter>
              <Button onClick={() => handleOpenChange(false)}>Done</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
