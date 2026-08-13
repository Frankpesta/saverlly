"use client"

import * as React from "react"
import { toast } from "sonner"
import { PlusIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
import { useCreateAnnouncement, useUploadAnnouncementImage } from "@/lib/api/hooks/use-announcements"
import { useLocations } from "@/lib/api/hooks/use-locations"
import { ApiError } from "@/lib/api/client"
import { toDatetimeLocal } from "@/lib/format-date"
import type { AnnouncementRepeatPolicy } from "@/lib/api/types"
import { AnnouncementPreview } from "./announcement-preview"
import { LocationTargetPicker } from "./location-target-picker"

const STEPS = [
  { title: "Content", description: "What should the announcement say?" },
  { title: "Schedule", description: "When should it run, and how often per visit?" },
  { title: "Targeting", description: "Which locations should show it?" },
] as const

const REPEAT_LABEL: Record<AnnouncementRepeatPolicy, string> = {
  ONCE: "Once",
  EVERY_LOGIN: "Every login",
  MAX_N_TIMES: "A set number of times",
}

export function NewAnnouncementDialog() {
  const [open, setOpen] = React.useState(false)
  const [step, setStep] = React.useState(0)
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
  const { data: locations } = useLocations()
  const fileInputRef = React.useRef<HTMLInputElement>(null)

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

  function reset() {
    setStep(0)
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
        locationIds,
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

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <Button onClick={() => setOpen(true)} className="gap-1.5">
        <PlusIcon className="size-4" />
        New Announcement
      </Button>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <WizardStepDots count={STEPS.length} current={step} />
          <DialogTitle>{STEPS[step].title}</DialogTitle>
          <DialogDescription>{STEPS[step].description}</DialogDescription>
        </DialogHeader>

        <form
          className="flex flex-1 flex-col justify-between overflow-y-auto"
          onSubmit={
            step < 2
              ? (e) => {
                  e.preventDefault()
                  setStep(step + 1)
                }
              : handleCreate
          }
        >
          <div className="flex flex-col gap-4 px-4">
            {step === 0 && (
              <>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="new-ann-title">Title</Label>
                  <Input
                    id="new-ann-title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    required
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="new-ann-body">Body</Label>
                  <Textarea
                    id="new-ann-body"
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    rows={4}
                    required
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="new-ann-media">Image (optional)</Label>
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
                </div>
                <AnnouncementPreview title={title} body={body} mediaUrl={mediaUrl || undefined} />
              </>
            )}

            {step === 1 && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="new-ann-start">Starts</Label>
                    <DateTimePicker id="new-ann-start" value={startAt} onChange={setStartAt} required />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="new-ann-end">Ends</Label>
                    <DateTimePicker id="new-ann-end" value={endAt} onChange={setEndAt} required />
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="new-ann-repeat">Repeat policy</Label>
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
                </div>
                {repeatPolicy === "MAX_N_TIMES" && (
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="new-ann-max-count">Display up to</Label>
                    <Input
                      id="new-ann-max-count"
                      type="number"
                      min="1"
                      value={maxDisplayCount}
                      onChange={(e) => setMaxDisplayCount(e.target.value)}
                      required
                    />
                    <p className="text-sm text-muted-foreground">
                      Times per device, ever, across all logins.
                    </p>
                  </div>
                )}
              </>
            )}

            {step === 2 && (
              <LocationTargetPicker
                locations={locations ?? []}
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
            <Button type="submit" disabled={createAnnouncement.isPending}>
              {step < 2 ? "Continue" : createAnnouncement.isPending ? "Creating…" : "Create announcement"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
