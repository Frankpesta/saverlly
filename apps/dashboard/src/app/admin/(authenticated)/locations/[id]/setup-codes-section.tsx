"use client"

import { toast } from "sonner"
import { CopyIcon, PlusIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import {
  useCreateSetupCode,
  useSetupCodes,
  useUpdateSetupCode,
} from "@/lib/api/hooks/use-setup-codes"
import { ApiError } from "@/lib/api/client"

export function SetupCodesSection({ locationId }: { locationId: string }) {
  const { data: codes, isLoading, isError } = useSetupCodes(locationId)
  const createCode = useCreateSetupCode(locationId)
  const updateCode = useUpdateSetupCode(locationId)

  function copyCode(code: string) {
    navigator.clipboard.writeText(code)
    toast.success("Setup code copied.")
  }

  function toggleActive(codeId: string, active: boolean) {
    updateCode.mutate(
      { codeId, active: !active },
      {
        onError: (error) =>
          toast.error(error instanceof ApiError ? error.message : "Could not update setup code."),
      },
    )
  }

  function generateCode() {
    createCode.mutate(undefined, {
      onSuccess: () => toast.success("New setup code generated."),
      onError: (error) =>
        toast.error(error instanceof ApiError ? error.message : "Could not generate setup code."),
    })
  }

  return (
    <Card className="w-full max-w-lg">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Setup codes</CardTitle>
        <Button
          variant="outline"
          size="sm"
          onClick={generateCode}
          disabled={createCode.isPending}
          className="gap-1.5"
        >
          <PlusIcon className="size-4" />
          Generate
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {isError && <p className="text-sm text-destructive">Could not load setup codes.</p>}
        {isLoading && <Skeleton className="h-10 w-full" />}
        {!isLoading && codes?.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No setup codes yet — generate one to register a device at this location.
          </p>
        )}
        {codes?.map((code) => (
          <div
            key={code.id}
            className="flex items-center justify-between rounded-xl border border-black/8 px-4 py-3"
          >
            <div className="flex items-center gap-2">
              <code className="rounded-md bg-muted px-2 py-1 font-mono text-sm tracking-wider">
                {code.code}
              </code>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => copyCode(code.code)}
                aria-label={`Copy code ${code.code}`}
              >
                <CopyIcon className="size-3.5" />
              </Button>
              <Badge variant={code.active ? "default" : "secondary"}>
                {code.active ? "Active" : "Revoked"}
              </Badge>
            </div>
            <Switch
              checked={code.active}
              onCheckedChange={() => toggleActive(code.id, code.active)}
              disabled={updateCode.isPending}
              aria-label={`Toggle setup code ${code.code}`}
            />
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
