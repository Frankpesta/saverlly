"use client"

import * as React from "react"
import { toast } from "sonner"
import { PencilIcon, PlusIcon } from "lucide-react"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { KeyValueEditor } from "@/components/dashboard/key-value-editor"
import { FormField, FormGrid } from "@/components/dashboard/form-section"
import {
  useCreateAffiliateProgram,
  useUpdateAffiliateProgram,
} from "@/lib/api/hooks/use-affiliate-programs"
import { ApiError } from "@/lib/api/client"
import type { AffiliateProgram } from "@/lib/api/types"

const affiliateProgramSchema = z.object({
  networkName: z.string().trim().min(1, "Network name is required"),
  programId: z.string().trim(),
  hasCouponApi: z.boolean(),
})

type AffiliateProgramFormValues = z.infer<typeof affiliateProgramSchema>

export function AffiliateProgramDialog({ program }: { program?: AffiliateProgram }) {
  const isEdit = !!program
  const [open, setOpen] = React.useState(false)
  const [credentials, setCredentials] = React.useState<Record<string, string>>({})

  const createProgram = useCreateAffiliateProgram()
  const updateProgram = useUpdateAffiliateProgram(program?.id ?? "")
  const isPending = createProgram.isPending || updateProgram.isPending

  const {
    register,
    control,
    handleSubmit,
    reset: resetForm,
    formState: { errors, isSubmitting },
  } = useForm<AffiliateProgramFormValues>({
    resolver: zodResolver(affiliateProgramSchema),
    mode: "onTouched",
    reValidateMode: "onChange",
    defaultValues: {
      networkName: program?.networkName ?? "",
      programId: program?.programId ?? "",
      hasCouponApi: program?.hasCouponApi ?? true,
    },
  })

  function reset() {
    resetForm({ networkName: "", programId: "", hasCouponApi: false })
    setCredentials({})
  }

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next && !isEdit) reset()
  }

  function onSubmit(values: AffiliateProgramFormValues) {
    const hasCredentialEntries = Object.keys(credentials).length > 0
    const shared = {
      networkName: values.networkName,
      programId: values.programId || undefined,
      hasCouponApi: values.hasCouponApi,
      ...(hasCredentialEntries ? { apiCredentials: credentials } : {}),
    }

    if (isEdit) {
      updateProgram.mutate(shared, {
        onSuccess: () => {
          toast.success(`${values.networkName} was updated.`)
          handleOpenChange(false)
        },
        onError: (error) =>
          toast.error(error instanceof ApiError ? error.message : "Could not update program."),
      })
    } else {
      createProgram.mutate(shared, {
        onSuccess: () => {
          toast.success(`${values.networkName} was added.`)
          handleOpenChange(false)
        },
        onError: (error) =>
          toast.error(error instanceof ApiError ? error.message : "Could not add program."),
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {isEdit ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={() => setOpen(true)}
          className="text-muted-foreground hover:text-foreground"
          aria-label={`Edit ${program?.networkName}`}
        >
          <PencilIcon className="size-3.5" />
        </Button>
      ) : (
        <Button onClick={() => setOpen(true)} className="gap-1.5">
          <PlusIcon className="size-4" />
          New Program
        </Button>
      )}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit affiliate program" : "New affiliate program"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Credentials are write-only — leave them blank to keep what's already stored."
              : "Register a network so merchants can connect to it for coupon sourcing."}
          </DialogDescription>
        </DialogHeader>

        <form className="flex flex-1 flex-col justify-between" onSubmit={handleSubmit(onSubmit)} noValidate>
          <div className="flex flex-col gap-4 px-6">
            <FormGrid>
              <FormField label="Network name" htmlFor="program-network-name" error={errors.networkName?.message}>
                <Input id="program-network-name" placeholder="Impact" {...register("networkName")} />
              </FormField>
              <FormField label="Program ID (optional)" htmlFor="program-id">
                <Input id="program-id" {...register("programId")} />
              </FormField>
            </FormGrid>
            <div className="flex items-center justify-between rounded-lg border border-black/8 p-3">
              <div>
                <Label htmlFor="program-has-api">Has a coupon API</Label>
                <p className="text-sm text-muted-foreground">
                  This program can feed coupon codes automatically.
                </p>
              </div>
              <Controller
                name="hasCouponApi"
                control={control}
                render={({ field }) => (
                  <Switch id="program-has-api" checked={field.value} onCheckedChange={field.onChange} />
                )}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Credentials {isEdit && "(leave blank to keep existing)"}</Label>
              <KeyValueEditor value={credentials} onChange={setCredentials} />
            </div>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={isPending || isSubmitting}>
              {isPending || isSubmitting ? "Saving…" : isEdit ? "Save changes" : "Add program"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
