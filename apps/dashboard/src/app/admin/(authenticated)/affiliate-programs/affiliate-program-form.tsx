"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { KeyValueEditor } from "@/components/dashboard/key-value-editor"
import { EntityFormCard, EntityFormHeader } from "@/components/dashboard/entity-form-page"
import { FormField, FormGrid, FormSection } from "@/components/dashboard/form-section"
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

/** One source of truth for a brand-new program's starting values. The dialog this replaced had
 * two: `defaultValues` seeded hasCouponApi to `true` while its `reset()` seeded `false`, so the
 * create form's default silently depended on whether it had been reset first. */
const NEW_PROGRAM_DEFAULTS: AffiliateProgramFormValues = {
  networkName: "",
  programId: "",
  hasCouponApi: true,
}

const BACK_HREF = "/admin/affiliate-programs"

export function AffiliateProgramForm({ program }: { program?: AffiliateProgram }) {
  const router = useRouter()
  const isEdit = !!program
  const [credentials, setCredentials] = React.useState<Record<string, string>>({})

  const createProgram = useCreateAffiliateProgram()
  const updateProgram = useUpdateAffiliateProgram(program?.id ?? "")

  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<AffiliateProgramFormValues>({
    resolver: zodResolver(affiliateProgramSchema),
    mode: "onTouched",
    reValidateMode: "onChange",
    defaultValues: program
      ? {
          networkName: program.networkName,
          programId: program.programId ?? "",
          hasCouponApi: program.hasCouponApi,
        }
      : NEW_PROGRAM_DEFAULTS,
  })

  function onSubmit(values: AffiliateProgramFormValues) {
    const hasCredentialEntries = Object.keys(credentials).length > 0
    const shared = {
      networkName: values.networkName,
      programId: values.programId || undefined,
      hasCouponApi: values.hasCouponApi,
      ...(hasCredentialEntries ? { apiCredentials: credentials } : {}),
    }

    const onSuccess = (message: string) => () => {
      toast.success(message)
      router.push(BACK_HREF)
    }
    const onError = (verb: string) => (error: unknown) =>
      toast.error(error instanceof ApiError ? error.message : `Could not ${verb} program.`)

    if (isEdit) {
      updateProgram.mutate(shared, {
        onSuccess: onSuccess(`${values.networkName} was updated.`),
        onError: onError("update"),
      })
    } else {
      createProgram.mutate(shared, {
        onSuccess: onSuccess(`${values.networkName} was added.`),
        onError: onError("add"),
      })
    }
  }

  const isPending = createProgram.isPending || updateProgram.isPending || isSubmitting

  return (
    <form className="flex flex-col gap-6" onSubmit={handleSubmit(onSubmit)} noValidate>
      <EntityFormHeader
        backHref={BACK_HREF}
        backLabel="Affiliate programs"
        heading={isEdit ? `Edit ${program.networkName}` : "New affiliate program"}
        description={
          isEdit
            ? "Credentials are write-only. Leave them blank to keep what's already stored."
            : "Register a network so merchants can connect to it for coupon sourcing."
        }
      />

      <EntityFormCard
        cancelHref={BACK_HREF}
        submitLabel={isEdit ? "Save changes" : "Add program"}
        pendingLabel="Saving…"
        isPending={isPending}
      >
        <FormSection label="Network">
          <FormGrid>
            <FormField label="Network name" htmlFor="program-network-name" error={errors.networkName?.message}>
              <Input id="program-network-name" placeholder="Impact" {...register("networkName")} />
            </FormField>
            <FormField label="Program ID (optional)" htmlFor="program-id">
              <Input id="program-id" {...register("programId")} />
            </FormField>
          </FormGrid>
          <div className="flex items-center justify-between rounded-lg border border-black/8 p-3 dark:border-white/10">
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
        </FormSection>

        <FormSection
          label="Credentials"
          description={
            isEdit
              ? "Leave blank to keep what's already stored. Saved values are never shown again."
              : "Add as many as the network's API needs, e.g. an API key and a separate secret."
          }
        >
          <KeyValueEditor value={credentials} onChange={setCredentials} />
        </FormSection>
      </EntityFormCard>
    </form>
  )
}
