"use client"

import * as React from "react"
import { toast } from "sonner"
import { Trash2Icon, TriangleAlertIcon } from "lucide-react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { useDeleteKiosk } from "@/lib/api/hooks/use-kiosks"
import { ApiError } from "@/lib/api/client"
import { exactMatchSchema } from "@/lib/validation/schemas"
import type { Kiosk } from "@/lib/api/types"

/**
 * Deleting a kiosk is irreversible and destroys everything under it: every user, location,
 * device, device activity history, announcement, and payout. So it's gated behind typing the
 * kiosk's exact name, not just a click-through confirmation like every other delete in the app.
 */
const confirmDeleteSchema = (kioskName: string) =>
  z.object({ confirmText: exactMatchSchema(kioskName) })

export function DeleteKioskButton({ kiosk, onDeleted }: { kiosk: Kiosk; onDeleted: () => void }) {
  const [open, setOpen] = React.useState(false)
  const deleteKiosk = useDeleteKiosk()

  const {
    register,
    reset: resetForm,
    formState: { isValid },
  } = useForm<{ confirmText: string }>({
    resolver: zodResolver(confirmDeleteSchema(kiosk.name)),
    mode: "onChange",
    defaultValues: { confirmText: "" },
  })

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) resetForm({ confirmText: "" })
  }

  function handleDelete() {
    deleteKiosk.mutate(kiosk.id, {
      onSuccess: () => {
        toast.success(`${kiosk.name} and everything under it was deleted.`)
        onDeleted()
      },
      onError: (error) =>
        toast.error(error instanceof ApiError ? error.message : "Could not delete kiosk."),
    })
  }

  const canDelete = isValid

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1.5 text-destructive"
        onClick={() => setOpen(true)}
      >
        <Trash2Icon className="size-4" />
        Delete kiosk
      </Button>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2 text-destructive">
            <TriangleAlertIcon className="size-5" />
            <DialogTitle>Delete {kiosk.name}?</DialogTitle>
          </div>
          <DialogDescription>
            This permanently deletes the kiosk and everything under it. Every user and login,
            every location and device, all device activity history, kiosk-scoped announcements,
            and payout records. This can&apos;t be undone.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2 px-7 pb-1">
          <label htmlFor="confirm-kiosk-name" className="text-sm text-muted-foreground">
            Type <span className="font-semibold text-foreground">{kiosk.name}</span> to confirm.
          </label>
          <Input id="confirm-kiosk-name" autoComplete="off" {...register("confirmText")} />
        </div>
        <DialogFooter className="px-7 pb-7">
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!canDelete || deleteKiosk.isPending}
            onClick={handleDelete}
            className="bg-destructive text-white hover:bg-destructive/90"
          >
            {deleteKiosk.isPending ? "Deleting…" : "Delete kiosk"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
