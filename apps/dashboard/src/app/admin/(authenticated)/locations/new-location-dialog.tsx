"use client"

import * as React from "react"
import { toast } from "sonner"
import { PlusIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { WizardStepDots } from "@/components/dashboard/wizard-step-dots"
import { useCreateLocation } from "@/lib/api/hooks/use-locations"
import { useKiosks } from "@/lib/api/hooks/use-kiosks"
import { ApiError } from "@/lib/api/client"

const STEPS = [
  { title: "Where is it?", description: "Which kiosk, and the business address." },
  { title: "Details", description: "Tags help with future targeting — optional." },
] as const

export function NewLocationDialog() {
  const [open, setOpen] = React.useState(false)
  const [step, setStep] = React.useState(0)
  const [kioskId, setKioskId] = React.useState("")
  const [name, setName] = React.useState("")
  const [address, setAddress] = React.useState("")
  const [city, setCity] = React.useState("")
  const [state, setState] = React.useState("")
  const [country, setCountry] = React.useState("")
  const [tags, setTags] = React.useState("")
  const createLocation = useCreateLocation()
  const { data: kiosks } = useKiosks()

  function reset() {
    setStep(0)
    setKioskId("")
    setName("")
    setAddress("")
    setCity("")
    setState("")
    setCountry("")
    setTags("")
  }

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) reset()
  }

  function handleCreate(event: React.FormEvent) {
    event.preventDefault()
    const tagList = tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean)

    createLocation.mutate(
      { kioskId, name, address, city, state, country, tags: tagList.length ? tagList : undefined },
      {
        onSuccess: () => {
          toast.success(`${name} was created.`)
          handleOpenChange(false)
        },
        onError: (error) =>
          toast.error(error instanceof ApiError ? error.message : "Could not create location."),
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <Button onClick={() => setOpen(true)} className="gap-1.5">
        <PlusIcon className="size-4" />
        New Location
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
                  <Label htmlFor="new-location-kiosk">Kiosk</Label>
                  <Select value={kioskId} onValueChange={setKioskId} required>
                    <SelectTrigger id="new-location-kiosk" className="w-full">
                      <SelectValue placeholder="Select a kiosk" />
                    </SelectTrigger>
                    <SelectContent>
                      {kiosks?.map((kiosk) => (
                        <SelectItem key={kiosk.id} value={kiosk.id}>
                          {kiosk.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="new-location-name">Name</Label>
                  <Input
                    id="new-location-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="new-location-address">Address</Label>
                  <Input
                    id="new-location-address"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="new-location-city">City</Label>
                    <Input
                      id="new-location-city"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      required
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="new-location-state">State</Label>
                    <Input
                      id="new-location-state"
                      value={state}
                      onChange={(e) => setState(e.target.value)}
                      required
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="new-location-country">Country</Label>
                  <Input
                    id="new-location-country"
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    required
                  />
                </div>
              </>
            )}

            {step === 1 && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="new-location-tags">Tags</Label>
                <Input
                  id="new-location-tags"
                  placeholder="mall, downtown, high-traffic"
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                />
                <p className="text-sm text-muted-foreground">
                  Comma-separated. Used for future ad targeting.
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
            <Button type="submit" disabled={createLocation.isPending || !kioskId}>
              {step === 0 ? "Continue" : createLocation.isPending ? "Creating…" : "Create location"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
