"use client"

import { toast } from "sonner"
import { CopyIcon, RefreshCwIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import {
  useCreateSetupCode,
  useSetupCode,
  useUpdateSetupCode,
} from "@/lib/api/hooks/use-setup-codes"
import { ApiError } from "@/lib/api/client"

/** Every location has at most one setup code — regenerating replaces it in place rather than
 * adding another, so there's never a list of old/stale codes to manage. */
export function SetupCodesSection({ locationId }: { locationId: string }) {
  const { data: code, isLoading, isError } = useSetupCode(locationId)
  const createCode = useCreateSetupCode(locationId)
  const updateCode = useUpdateSetupCode(locationId)

  async function copyCode() {
    if (!code) return
    try {
      await navigator.clipboard.writeText(code.code)
      toast.success("Setup code copied.")
    } catch {
      toast.error("Could not copy to clipboard.")
    }
  }

  function toggleActive() {
    if (!code) return
    updateCode.mutate(!code.active, {
      onError: (error) =>
        toast.error(error instanceof ApiError ? error.message : "Could not update setup code."),
    })
  }

  function generateCode() {
    createCode.mutate(undefined, {
      onSuccess: () => toast.success(code ? "Setup code regenerated." : "Setup code generated."),
      onError: (error) =>
        toast.error(error instanceof ApiError ? error.message : "Could not generate setup code."),
    })
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Setup code</CardTitle>
        {code && (
          <Button
            variant="outline"
            size="sm"
            onClick={generateCode}
            disabled={createCode.isPending}
            className="gap-1.5"
          >
            <RefreshCwIcon className="size-3.5" />
            Regenerate
          </Button>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {isError && <p className="text-sm text-destructive">Could not load the setup code.</p>}
        {isLoading && <Skeleton className="h-10 w-full" />}
        {!isLoading && !code && (
          <div className="flex flex-col items-start gap-3">
            <p className="text-sm text-muted-foreground">
              No setup code yet — generate one to register devices at this location.
            </p>
            <Button
              size="sm"
              onClick={generateCode}
              disabled={createCode.isPending}
              className="gap-1.5"
            >
              <RefreshCwIcon className="size-3.5" />
              Generate setup code
            </Button>
          </div>
        )}
        {code && (
          <div className="flex items-center justify-between rounded-lg border border-black/8 px-4 py-3">
            <div className="flex items-center gap-2">
              <code className="rounded-md bg-muted px-2 py-1 font-mono text-sm tracking-wider">
                {code.code}
              </code>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={copyCode}
                aria-label={`Copy code ${code.code}`}
              >
                <CopyIcon className="size-3.5" />
              </Button>
              <Badge variant={code.active ? "success" : "secondary"}>
                {code.active ? "Active" : "Revoked"}
              </Badge>
            </div>
            <Switch
              checked={code.active}
              onCheckedChange={toggleActive}
              disabled={updateCode.isPending}
              aria-label={`Toggle setup code ${code.code}`}
            />
          </div>
        )}
      </CardContent>
    </Card>
  )
}
