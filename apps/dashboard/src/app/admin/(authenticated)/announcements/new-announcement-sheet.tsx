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
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"
import { useCreateAnnouncement, useUploadAnnouncementImage } from "@/lib/api/hooks/use-announcements"
import { useKiosks } from "@/lib/api/hooks/use-kiosks"
import { useLocations } from "@/lib/api/hooks/use-locations"
import { ApiError } from "@/lib/api/client"
import type { AnnouncementRepeatPolicy } from "@/lib/api/types"
import { cn } from "@/lib/utils"
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

function toDatetimeLocal(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function NewAnnouncementSheet() {
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

  const canContinueFromStep =
    stepKey !== "kiosk" || !!kioskId

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <Button onClick={() => setOpen(true)} className="gap-1.5">
        <PlusIcon className="size-4" />
        New Announcement
      </Button>
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <div className="mb-1 flex items-center gap-1.5">
            {stepKeys.map((key, i) => (
              <span
                key={key}
                className={cn(
                  "h-1.5 flex-1 rounded-full transition-colors",
                  i <= step ? "bg-[var(--brand-teal)]" : "bg-muted",
                )}
              />
            ))}
          </div>
          <SheetTitle>{STEP_INFO[stepKey].title}</SheetTitle>
          <SheetDescription>{STEP_INFO[stepKey].description}</SheetDescription>
        </SheetHeader>

        <form
          className="flex flex-1 flex-col justify-between overflow-y-auto"
          onSubmit={
            isLastStep
              ? handleCreate
              : (e) => {
                  e.preventDefault()
                  setStep(step + 1)
                }
          }
        >
          <div className="flex flex-col gap-4 px-4">
            {stepKey === "content" && (
              <>
                <div className="flex items-center justify-between rounded-xl border border-black/8 p-3">
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

            {stepKey === "kiosk" && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="new-ann-kiosk">Kiosk</Label>
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
              </div>
            )}

            {stepKey === "schedule" && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="new-ann-start">Starts</Label>
                    <Input
                      id="new-ann-start"
                      type="datetime-local"
                      value={startAt}
                      onChange={(e) => setStartAt(e.target.value)}
                      required
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="new-ann-end">Ends</Label>
                    <Input
                      id="new-ann-end"
                      type="datetime-local"
                      value={endAt}
                      onChange={(e) => setEndAt(e.target.value)}
                      required
                    />
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

            {stepKey === "targeting" && (
              <LocationTargetPicker
                locations={kioskLocations}
                value={locationIds}
                onChange={setLocationIds}
              />
            )}
          </div>

          <SheetFooter className="flex-row justify-end">
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
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
