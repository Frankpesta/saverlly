"use client"

import * as React from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
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
import { FormField, FormGrid } from "@/components/dashboard/form-section"
import { Switch } from "@/components/ui/switch"
import {
  useKiosk,
  useUpdateKiosk,
  useUpdateKioskStatus,
} from "@/lib/api/hooks/use-kiosks"
import { ApiError } from "@/lib/api/client"
import type { Kiosk } from "@/lib/api/types"
import { KIOSK_STATUS_BADGE_VARIANT, KIOSK_STATUS_LABEL } from "@/lib/dashboard/status-labels"
import { KioskUsersSection } from "./kiosk-users-section"

export default function KioskDetailPage() {
  const { id } = useParams<{ id: string }>()
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
      <div className="flex flex-col gap-4 border-b border-black/[0.09] pb-6 sm:flex-row sm:items-end sm:justify-between">
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
          <Badge variant={KIOSK_STATUS_BADGE_VARIANT[kiosk.status]}>{KIOSK_STATUS_LABEL[kiosk.status]}</Badge>
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
                <span className="text-sm text-muted-foreground">{kiosk.status === "ACTIVE" ? "Enabled" : "Disabled"}</span>
              </div>
            </CardHeader>
            <KioskEditForm key={kiosk.id} kiosk={kiosk} />
          </Card>

          <KioskUsersSection kioskId={kiosk.id} />
        </div>
      )}
    </div>
  )
}

function KioskEditForm({ kiosk }: { kiosk: Kiosk }) {
  const updateKiosk = useUpdateKiosk(kiosk.id)
  const [name, setName] = React.useState(kiosk.name)
  const [revenueSharePct, setRevenueSharePct] = React.useState(kiosk.revenueSharePct)
  const [contactEmail, setContactEmail] = React.useState(kiosk.contactEmail)

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    updateKiosk.mutate(
      { name, revenueSharePct: Number(revenueSharePct), contactEmail },
      {
        onSuccess: () => toast.success("Kiosk updated."),
        onError: (error) =>
          toast.error(error instanceof ApiError ? error.message : "Could not update kiosk."),
      },
    )
  }

  return (
    <form onSubmit={handleSubmit}>
      <CardContent className="flex flex-col gap-4">
        <FormGrid>
          <FormField label="Name" htmlFor="name">
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
          </FormField>
          <FormField label="Revenue Share (%)" htmlFor="revenueSharePct">
            <Input
              id="revenueSharePct"
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={revenueSharePct}
              onChange={(e) => setRevenueSharePct(e.target.value)}
              required
            />
          </FormField>
        </FormGrid>
        <FormField label="Contact Email" htmlFor="contactEmail">
          <Input
            id="contactEmail"
            type="email"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
            required
          />
        </FormField>
      </CardContent>
      <CardFooter>
        <Button type="submit" disabled={updateKiosk.isPending}>
          {updateKiosk.isPending ? "Saving…" : "Save changes"}
        </Button>
      </CardFooter>
    </form>
  )
}
