"use client"

import * as React from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { toast } from "sonner"
import { ArrowLeftIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { FormField, FormGrid } from "@/components/dashboard/form-section"
import { RevenueShareInput } from "@/components/dashboard/revenue-share-input"
import { Switch } from "@/components/ui/switch"
import { DeleteKioskButton } from "./delete-kiosk-button"
import {
  useKiosk,
  useUpdateKiosk,
  useUpdateKioskStatus,
} from "@/lib/api/hooks/use-kiosks"
import { ApiError } from "@/lib/api/client"
import type { Kiosk } from "@/lib/api/types"
import { KIOSK_STATUS_BADGE_VARIANT, KIOSK_STATUS_LABEL } from "@/lib/dashboard/status-labels"
import { nameSchema, revenueShareSchema } from "@/lib/validation/schemas"
import { KioskUsersSection } from "./kiosk-users-section"
import { KioskLocationsSection } from "./kiosk-locations-section"

const kioskEditSchema = z.object({
  name: nameSchema,
  revenueSharePct: revenueShareSchema,
})

type KioskEditFormValues = z.infer<typeof kioskEditSchema>

export default function KioskDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { data: kiosk, isLoading, isError } = useKiosk(id)
  const updateStatus = useUpdateKioskStatus()

  function toggleStatus() {
    if (!kiosk) return
    const next = kiosk.status === "ACTIVE" ? "INACTIVE" : "ACTIVE"
    updateStatus.mutate(
      { id: kiosk.id, status: next },
      {
        onError: (error) =>
          toast.error(
            error instanceof ApiError ? error.message : "Could not update kiosk status.",
          ),
      },
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 border-b border-black/[0.09] dark:border-white/10 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-3">
          <Link href="/admin/kiosks" className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeftIcon className="size-4" />
            Kiosks
          </Link>
          <div>
            <p className="text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">Kiosk profile</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight">{kiosk?.name ?? "Kiosk"}</h2>
          </div>
        </div>
        {kiosk && (
          <div className="flex items-center gap-3">
            <Badge variant={KIOSK_STATUS_BADGE_VARIANT[kiosk.status]}>{KIOSK_STATUS_LABEL[kiosk.status]}</Badge>
            <DeleteKioskButton kiosk={kiosk} onDeleted={() => router.push("/admin/kiosks")} />
          </div>
        )}
      </div>

      {isError && <p className="text-sm text-destructive">Could not load this kiosk.</p>}

      {isLoading && <Skeleton className="h-64 w-full max-w-lg" />}

      {kiosk && (
        <div className="grid grid-cols-1 items-start gap-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Business details</CardTitle>
              <div className="flex items-center gap-2">
                <Switch
                  checked={kiosk.status === "ACTIVE"}
                  onCheckedChange={toggleStatus}
                  disabled={updateStatus.isPending}
                  aria-label="Toggle kiosk status"
                />
                {/* Same word the header badge uses for this exact state. This card used to say
                    "Enabled"/"Disabled" next to a badge two inches away reading "Active"/
                    "Inactive" for the identical value. */}
                <span className="text-sm text-muted-foreground">{KIOSK_STATUS_LABEL[kiosk.status]}</span>
              </div>
            </CardHeader>
            <KioskEditForm key={kiosk.id} kiosk={kiosk} />
          </Card>

          <div className="flex flex-col gap-10">
            <KioskUsersSection kioskId={kiosk.id} />
            <KioskLocationsSection kioskId={kiosk.id} />
          </div>
        </div>
      )}
    </div>
  )
}

function KioskEditForm({ kiosk }: { kiosk: Kiosk }) {
  const updateKiosk = useUpdateKiosk(kiosk.id)
  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<KioskEditFormValues>({
    resolver: zodResolver(kioskEditSchema),
    mode: "onTouched",
    reValidateMode: "onChange",
    defaultValues: { name: kiosk.name, revenueSharePct: Number(kiosk.revenueSharePct) },
  })

  function onSubmit(values: KioskEditFormValues) {
    updateKiosk.mutate(values, {
      onSuccess: () => toast.success("Kiosk updated."),
      onError: (error) =>
        toast.error(error instanceof ApiError ? error.message : "Could not update kiosk."),
    })
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="contents">
      <CardContent className="flex flex-col gap-4">
        <FormGrid>
          <FormField label="Name" htmlFor="name" error={errors.name?.message}>
            <Input id="name" {...register("name")} />
          </FormField>
          <FormField label="Revenue Share (%)" htmlFor="revenueSharePct" error={errors.revenueSharePct?.message}>
            <Controller
              name="revenueSharePct"
              control={control}
              render={({ field, fieldState }) => (
                <RevenueShareInput
                  id="revenueSharePct"
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  aria-invalid={!!fieldState.error}
                />
              )}
            />
          </FormField>
        </FormGrid>
      </CardContent>
      <CardFooter>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Saving…" : "Save changes"}
        </Button>
      </CardFooter>
    </form>
  )
}
