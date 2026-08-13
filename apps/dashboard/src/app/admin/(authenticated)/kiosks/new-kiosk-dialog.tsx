"use client"

import * as React from "react"
import { toast } from "sonner"
import { PlusIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { WizardStepDots } from "@/components/dashboard/wizard-step-dots"
import { useCreateKiosk } from "@/lib/api/hooks/use-kiosks"
import { ApiError } from "@/lib/api/client"

const STEPS = [
  { title: "Business info", description: "Who is this kiosk business?" },
  { title: "Revenue share", description: "What share does the kiosk keep?" },
] as const

export function NewKioskDialog() {
  const [open, setOpen] = React.useState(false)
  const [step, setStep] = React.useState(0)
  const [name, setName] = React.useState("")
  const [contactEmail, setContactEmail] = React.useState("")
  const [revenueSharePct, setRevenueSharePct] = React.useState("30")
  const createKiosk = useCreateKiosk()

  function reset() {
    setStep(0)
    setName("")
    setContactEmail("")
    setRevenueSharePct("30")
  }

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) reset()
  }

  function handleCreate(event: React.FormEvent) {
    event.preventDefault()
    createKiosk.mutate(
      { name, contactEmail, revenueSharePct: Number(revenueSharePct) },
      {
        onSuccess: () => {
          toast.success(`${name} was created.`)
          handleOpenChange(false)
        },
        onError: (error) =>
          toast.error(error instanceof ApiError ? error.message : "Could not create kiosk."),
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <Button onClick={() => setOpen(true)} className="gap-1.5">
        <PlusIcon className="size-4" />
        New Kiosk
      </Button>
      <DialogContent>
        <DialogHeader>
          <WizardStepDots count={STEPS.length} current={step} />
          <DialogTitle>{STEPS[step].title}</DialogTitle>
          <DialogDescription>{STEPS[step].description}</DialogDescription>
        </DialogHeader>

        <form
          className="flex flex-1 flex-col justify-between"
          onSubmit={
            step === 0
              ? (e) => {
                  e.preventDefault()
                  setStep(1)
                }
              : handleCreate
          }
        >
          <div className="flex flex-col gap-4 px-4">
            {step === 0 && (
              <>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="new-kiosk-name">Name</Label>
                  <Input
                    id="new-kiosk-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="new-kiosk-email">Contact email</Label>
                  <Input
                    id="new-kiosk-email"
                    type="email"
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    required
                  />
                </div>
              </>
            )}

            {step === 1 && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="new-kiosk-revenue">Revenue share (%)</Label>
                <Input
                  id="new-kiosk-revenue"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={revenueSharePct}
                  onChange={(e) => setRevenueSharePct(e.target.value)}
                  required
                />
                <p className="text-sm text-muted-foreground">
                  The percentage of commission {name || "this kiosk"} keeps. New kiosks start
                  active.
                </p>
              </div>
            )}
          </div>

          <DialogFooter className="flex-row justify-end">
            {step === 1 && (
              <Button type="button" variant="outline" onClick={() => setStep(0)}>
                Back
              </Button>
            )}
            <Button type="submit" disabled={createKiosk.isPending}>
              {step === 0 ? "Continue" : createKiosk.isPending ? "Creating…" : "Create kiosk"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
