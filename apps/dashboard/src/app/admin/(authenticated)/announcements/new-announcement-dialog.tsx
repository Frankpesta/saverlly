"use client"

import * as React from "react"
import { toast } from "sonner"
import { PlusIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
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
import { DateTimePicker } from "@/components/dashboard/date-time-picker"
import { WizardStepDots } from "@/components/dashboard/wizard-step-dots"
import { FormField, FormGrid } from "@/components/dashboard/form-section"
import { useCreateAnnouncement, useUploadAnnouncementImage } from "@/lib/api/hooks/use-announcements"
import { useKiosks } from "@/lib/api/hooks/use-kiosks"
import { useLocations } from "@/lib/api/hooks/use-locations"
import { ApiError } from "@/lib/api/client"
import { toDatetimeLocal } from "@/lib/format-date"
import type { AnnouncementRepeatPolicy } from "@/lib/api/types"
import { AnnouncementPreview } from "./announcement-preview"
import { LocationTargetPicker } from "./location-target-picker"

type StepKey = "content" | "kiosk" | "schedule" | "targeting"

const STEP_INFO: Record<StepKey, { title: string; description: string }> = {
  content: { title: "Content", description: "What should the announcement say?" },
  kiosk: { title: "Kiosk", description: "Which kiosk business is this for?" },
  schedule: { title: "Schedule", description: "When should it run, and how often per visit?" },
  targeting: { title: "Targeting", description: "Which locations should show it?" },
}

const REPEAT_LABEL: Record<AnnouncementRepeatPolicy, string> = {
  ONCE: "Once",
  EVERY_LOGIN: "Every login",
  MAX_N_TIMES: "A set number of times",
}

export function NewAnnouncementDialog() {
  const [open, setOpen] = React.useState(false)
  const [step, setStep] = React.useState(0)
  const [broadcast, setBroadcast] = React.useState(false)
  const [kioskId, setKioskId] = React.useState("")
  const [title, setTitle] = React.useState("")
  const [body, setBody] = React.useState("")
  const [mediaUrl, setMediaUrl] = React.useState("")
  const [startAt, setStartAt] = React.useState(() => toDatetimeLocal(new Date()))
  const [endAt, setEndAt] = React.useState(() =>
    toDatetimeLocal(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)),
  )
  const [repeatPolicy, setRepeatPolicy] = React.useState<AnnouncementRepeatPolicy>("ONCE")
  const [maxDisplayCount, setMaxDisplayCount] = React.useState("3")
  const [locationIds, setLocationIds] = React.useState<string[]>([])

  const createAnnouncement = useCreateAnnouncement()
  const uploadImage = useUploadAnnouncementImage()
  const { data: kiosks } = useKiosks()
  const { data: allLocations } = useLocations()
  const fileInputRef = React.useRef<HTMLInputElement>(null)

  // A broadcast targets everyone — there's nothing to pick a kiosk or locations for.
  const stepKeys: StepKey[] = broadcast
    ? ["content", "schedule"]
    : ["content", "kiosk", "schedule", "targeting"]
  const stepKey = stepKeys[step]
  const isLastStep = step === stepKeys.length - 1

  const kioskLocations = React.useMemo(
    () => (allLocations ?? []).filter((l) => l.kioskId === kioskId),
    [allLocations, kioskId],
  )

  function reset() {
    setStep(0)
    setBroadcast(false)
    setKioskId("")
    setTitle("")
    setBody("")
    setMediaUrl("")
    setStartAt(toDatetimeLocal(new Date()))
    setEndAt(toDatetimeLocal(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)))
    setRepeatPolicy("ONCE")
    setMaxDisplayCount("3")
    setLocationIds([])
  }

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) reset()
  }

  function handleFileSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) return
    uploadImage.mutate(file, {
      onSuccess: (data) => setMediaUrl(data.url),
      onError: (error) =>
        toast.error(error instanceof ApiError ? error.message : "Could not upload image."),
    })
  }

  function handleCreate(event: React.FormEvent) {
    event.preventDefault()
    createAnnouncement.mutate(
      {
        title,
        body,
        mediaUrl: mediaUrl || undefined,
        startAt: new Date(startAt).toISOString(),
        endAt: new Date(endAt).toISOString(),
        repeatPolicy,
        maxDisplayCount: repeatPolicy === "MAX_N_TIMES" ? Number(maxDisplayCount) : undefined,
        broadcast,
        ...(broadcast ? {} : { kioskId, locationIds }),
      },
      {
        onSuccess: () => {
          toast.success(`${title} was created.`)
          handleOpenChange(false)
        },
        onError: (error) =>
          toast.error(error instanceof ApiError ? error.message : "Could not create announcement."),
      },
    )
  }

  const canContinueFromStep = stepKey !== "kiosk" || !!kioskId

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <Button onClick={() => setOpen(true)} className="gap-1.5">
        <PlusIcon className="size-4" />
        New Announcement
      </Button>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{STEP_INFO[stepKey].title}</DialogTitle>
          <WizardStepDots count={stepKeys.length} current={step} steps={stepKeys.map((key) => STEP_INFO[key])} />
          <DialogDescription>{STEP_INFO[stepKey].description}</DialogDescription>
        </DialogHeader>

        <form
          className="flex flex-col justify-between"
          onSubmit={
            isLastStep
              ? handleCreate
              : (e) => {
                  e.preventDefault()
                  setStep(step + 1)
                }
          }
        >
          <div className="flex flex-col gap-4 px-6">
            {stepKey === "content" && (
              <>
                <div className="flex items-center justify-between rounded-lg border border-black/8 p-3">
                  <div>
                    <Label htmlFor="new-ann-broadcast">Broadcast to all kiosks</Label>
                    <p className="text-sm text-muted-foreground">
                      Shows on every device across the entire platform.
                    </p>
                  </div>
                  <Switch
                    id="new-ann-broadcast"
                    checked={broadcast}
                    onCheckedChange={setBroadcast}
                  />
                </div>
                <FormField label="Title" htmlFor="new-ann-title">
                  <Input
                    id="new-ann-title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    required
                  />
                </FormField>
                <FormField label="Body" htmlFor="new-ann-body">
                  <Textarea
                    id="new-ann-body"
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    rows={4}
                    required
                  />
                </FormField>
                <FormField label="Image (optional)" htmlFor="new-ann-media">
                  <div className="flex gap-2">
                    <Input
                      id="new-ann-media"
                      type="url"
                      placeholder="https://…"
                      value={mediaUrl}
                      onChange={(e) => setMediaUrl(e.target.value)}
                    />
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      className="hidden"
                      onChange={handleFileSelected}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      disabled={uploadImage.isPending}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      {uploadImage.isPending ? "Uploading…" : "Upload"}
                    </Button>
                  </div>
                </FormField>
                <AnnouncementPreview title={title} body={body} mediaUrl={mediaUrl || undefined} />
              </>
            )}

            {stepKey === "kiosk" && (
              <FormField label="Kiosk" htmlFor="new-ann-kiosk">
                <Select value={kioskId} onValueChange={setKioskId} required>
                  <SelectTrigger id="new-ann-kiosk" className="w-full">
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
              </FormField>
            )}

            {stepKey === "schedule" && (
              <>
                <FormGrid>
                  <FormField label="Starts" htmlFor="new-ann-start">
                    <DateTimePicker id="new-ann-start" value={startAt} onChange={setStartAt} required />
                  </FormField>
                  <FormField label="Ends" htmlFor="new-ann-end">
                    <DateTimePicker id="new-ann-end" value={endAt} onChange={setEndAt} required />
                  </FormField>
                </FormGrid>
                <FormField label="Repeat policy" htmlFor="new-ann-repeat">
                  <Select
                    value={repeatPolicy}
                    onValueChange={(v) => setRepeatPolicy(v as AnnouncementRepeatPolicy)}
                  >
                    <SelectTrigger id="new-ann-repeat" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(REPEAT_LABEL) as AnnouncementRepeatPolicy[]).map((policy) => (
                        <SelectItem key={policy} value={policy}>
                          {REPEAT_LABEL[policy]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormField>
                {repeatPolicy === "MAX_N_TIMES" && (
                  <FormField
                    label="Display up to"
                    htmlFor="new-ann-max-count"
                    hint="Times per device, ever, across all logins."
                  >
                    <Input
                      id="new-ann-max-count"
                      type="number"
                      min="1"
                      value={maxDisplayCount}
                      onChange={(e) => setMaxDisplayCount(e.target.value)}
                      required
                    />
                  </FormField>
                )}
              </>
            )}

            {stepKey === "targeting" && (
              <LocationTargetPicker
                locations={kioskLocations}
                value={locationIds}
                onChange={setLocationIds}
              />
            )}
          </div>

          <DialogFooter className="flex-row justify-end">
            {step > 0 && (
              <Button type="button" variant="outline" onClick={() => setStep(step - 1)}>
                Back
              </Button>
            )}
            <Button type="submit" disabled={createAnnouncement.isPending || !canContinueFromStep}>
              {!isLastStep
                ? "Continue"
                : createAnnouncement.isPending
                  ? "Creating…"
                  : "Create announcement"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
