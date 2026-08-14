"use client"

import * as React from "react"
import { toast } from "sonner"
import { CopyIcon, PlusIcon } from "lucide-react"
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
import { useCreateKiosk, type CreateKioskResult } from "@/lib/api/hooks/use-kiosks"
import { ApiError } from "@/lib/api/client"

type StepKey = "business" | "revenue" | "owner" | "reveal"

const STEP_INFO: Record<StepKey, { title: string; description: string }> = {
  business: { title: "Business info", description: "Who is this kiosk business?" },
  revenue: { title: "Revenue share", description: "What share does the kiosk keep?" },
  owner: { title: "Kiosk owner", description: "Who signs in to manage this kiosk?" },
  reveal: { title: "Account created", description: "Share these credentials with the kiosk owner" },
}

const stepKeys: StepKey[] = ["business", "revenue", "owner", "reveal"]

export function NewKioskDialog() {
  const [open, setOpen] = React.useState(false)
  const [step, setStep] = React.useState(0)
  const [name, setName] = React.useState("")
  const [contactEmail, setContactEmail] = React.useState("")
  const [revenueSharePct, setRevenueSharePct] = React.useState("30")
  const [ownerEmail, setOwnerEmail] = React.useState("")
  const [result, setResult] = React.useState<CreateKioskResult | null>(null)
  const createKiosk = useCreateKiosk()

  const stepKey = stepKeys[step]
  const isLastInputStep = stepKey === "owner"

  function reset() {
    setStep(0)
    setName("")
    setContactEmail("")
    setRevenueSharePct("30")
    setOwnerEmail("")
    setResult(null)
  }

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) reset()
  }

  function copyPassword(password: string) {
    navigator.clipboard.writeText(password)
    toast.success("Password copied.")
  }

  function handleCreate(event: React.FormEvent) {
    event.preventDefault()
    createKiosk.mutate(
      {
        name,
        contactEmail,
        revenueSharePct: Number(revenueSharePct),
        owner: { email: ownerEmail },
      },
      {
        onSuccess: (data) => {
          setResult(data)
          setStep(stepKeys.indexOf("reveal"))
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
          <WizardStepDots count={stepKeys.length} current={step} />
          <DialogTitle>{STEP_INFO[stepKey].title}</DialogTitle>
          <DialogDescription>{STEP_INFO[stepKey].description}</DialogDescription>
        </DialogHeader>

        <form
          className="flex flex-1 flex-col justify-between"
          onSubmit={
            isLastInputStep
              ? handleCreate
              : stepKey === "reveal"
                ? (e) => {
                    e.preventDefault()
                    handleOpenChange(false)
                  }
                : (e) => {
                    e.preventDefault()
                    setStep(step + 1)
                  }
          }
        >
          <div className="flex flex-col gap-4 px-4">
            {stepKey === "business" && (
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

            {stepKey === "revenue" && (
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

            {stepKey === "owner" && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="new-kiosk-owner-email">Owner email</Label>
                <Input
                  id="new-kiosk-owner-email"
                  type="email"
                  value={ownerEmail}
                  onChange={(e) => setOwnerEmail(e.target.value)}
                  required
                />
                <p className="text-sm text-muted-foreground">
                  We&apos;ll generate a secure password and email it to them — you&apos;ll also
                  see it once on the next screen.
                </p>
              </div>
            )}

            {stepKey === "reveal" && result && (
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-2 rounded-xl border border-black/8 px-4 py-3">
                  <div>
                    <p className="text-sm text-muted-foreground">Email</p>
                    <p className="text-sm font-medium">{result.owner.email}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Temporary password</p>
                    <div className="flex items-center gap-2">
                      <code className="rounded-md bg-muted px-2 py-1 font-mono text-sm tracking-wider">
                        {result.generatedPassword}
                      </code>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => copyPassword(result.generatedPassword)}
                        aria-label="Copy password"
                      >
                        <CopyIcon className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  We also emailed this to {result.owner.email}. They&apos;ll be asked to set a
                  new password the first time they log in.
                </p>
              </div>
            )}
          </div>

          <DialogFooter className="flex-row justify-end">
            {step > 0 && stepKey !== "reveal" && (
              <Button type="button" variant="outline" onClick={() => setStep(step - 1)}>
                Back
              </Button>
            )}
            <Button type="submit" disabled={createKiosk.isPending}>
              {stepKey === "reveal"
                ? "Done"
                : isLastInputStep
                  ? createKiosk.isPending
                    ? "Creating…"
                    : "Create kiosk"
                  : "Continue"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
