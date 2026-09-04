"use client"

import { toast } from "sonner"
import { CopyIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useCreateSetupCode } from "@/lib/api/hooks/use-setup-codes"
import { ApiError } from "@/lib/api/client"
import type { Location } from "@/lib/api/types"

/** The setup code, shown and generatable straight from the locations table.
 *
 * It used to exist only inside a card partway down a location's own detail page, which the
 * client reported as having to hunt for. The code now travels with the location payload, so
 * this row needs no extra request to display it. */
export function SetupCodeCell({ location }: { location: Location }) {
  const createCode = useCreateSetupCode(location.id)
  const code = location.locationSetupCode

  async function copyCode() {
    if (!code) return
    try {
      await navigator.clipboard.writeText(code.code)
      toast.success("Setup code copied.")
    } catch {
      toast.error("Could not copy to clipboard.")
    }
  }

  function generate() {
    createCode.mutate(undefined, {
      onSuccess: () => toast.success(`Setup code generated for ${location.name}.`),
      onError: (error) =>
        toast.error(error instanceof ApiError ? error.message : "Could not generate setup code."),
    })
  }

  if (!code) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={generate}
        disabled={createCode.isPending}
      >
        {createCode.isPending ? "Generating…" : "Generate"}
      </Button>
    )
  }

  return (
    <div className="flex items-center gap-1">
      <code
        className={
          code.active
            ? "rounded-md bg-muted px-2 py-1 font-mono text-xs tracking-wider"
            : "rounded-md bg-muted px-2 py-1 font-mono text-xs tracking-wider line-through opacity-60"
        }
        title={code.active ? undefined : "Revoked"}
      >
        {code.code}
      </code>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={copyCode}
        aria-label={`Copy setup code for ${location.name}`}
      >
        <CopyIcon className="size-3.5" />
      </Button>
    </div>
  )
}
