"use client"

import { Trash2Icon } from "lucide-react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"

/** A row-level delete action: an icon button that opens a confirmation dialog before calling
 * `onConfirm`. Shared across every table row with a delete action (scrape sources, affiliate
 * programs, devices, locations, kiosks, …) so the confirmation copy/behavior stays consistent. */
export function DeleteRowButton({
  itemLabel,
  description,
  onConfirm,
  isPending,
  ariaLabel,
  variant = "icon",
}: {
  /** The specific thing being deleted, e.g. "SAVE10" or "Downtown Location" — used in the title. */
  itemLabel: string
  /** Extra detail about what deleting this cascades to, if anything. */
  description?: string
  onConfirm: () => void
  isPending?: boolean
  ariaLabel?: string
  /** "icon" (default) for a compact table-row action; "button" for a page-header action. */
  variant?: "icon" | "button"
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        {variant === "button" ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5 text-destructive"
            aria-label={ariaLabel ?? `Delete ${itemLabel}`}
          >
            <Trash2Icon className="size-4" />
            Delete
          </Button>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            aria-label={ariaLabel ?? `Delete ${itemLabel}`}
          >
            <Trash2Icon className="size-3.5" />
          </Button>
        )}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {itemLabel}?</AlertDialogTitle>
          <AlertDialogDescription>
            {description ?? "This can't be undone."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={isPending}
            className="bg-destructive text-white hover:bg-destructive/90"
          >
            {isPending ? "Deleting…" : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
