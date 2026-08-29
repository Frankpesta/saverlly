"use client"

import * as React from "react"
import { toast } from "sonner"
import { PlusIcon } from "lucide-react"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import {
  Combobox,
} from "@/components/ui/combobox"
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
import { ImageUploadField } from "@/components/dashboard/image-upload-field"
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

const REPEAT_POLICIES = ["ONCE", "EVERY_LOGIN", "MAX_N_TIMES"] as const

const REPEAT_LABEL: Record<AnnouncementRepeatPolicy, string> = {
  ONCE: "Once",
  EVERY_LOGIN: "Every login",
  MAX_N_TIMES: "A set number of times",
}

const STEP_FIELDS: Partial<Record<StepKey, ("title" | "body" | "kioskId" | "startAt" | "endAt" | "repeatPolicy" | "maxDisplayCount")[]>> = {
  content: ["title", "body"],
  kiosk: ["kioskId"],
  schedule: ["startAt", "endAt", "repeatPolicy", "maxDisplayCount"],
}

const newAnnouncementSchema = z
  .object({
    broadcast: z.boolean(),
    kioskId: z.string(),
    title: z.string().trim().min(1, "Title is required"),
    body: z.string().trim().min(1, "Body is required"),
    mediaUrl: z.string().trim(),
    startAt: z.string().min(1, "Start date is required"),
    endAt: z.string().min(1, "End date is required"),
    repeatPolicy: z.enum(REPEAT_POLICIES),
    maxDisplayCount: z.string().trim(),
    locationIds: z.array(z.string()),
  })
  .superRefine((data, ctx) => {
    if (!data.broadcast && !data.kioskId) {
      ctx.addIssue({ code: "custom", message: "Select a kiosk", path: ["kioskId"] })
    }
    if (data.repeatPolicy === "MAX_N_TIMES") {
      const n = Number(data.maxDisplayCount)
      if (!data.maxDisplayCount || Number.isNaN(n) || n < 1) {
        ctx.addIssue({ code: "custom", message: "Enter a number of at least 1", path: ["maxDisplayCount"] })
      }
    }
  })

type NewAnnouncementFormValues = z.infer<typeof newAnnouncementSchema>

export function NewAnnouncementDialog() {
  const [open, setOpen] = React.useState(false)
  const [step, setStep] = React.useState(0)

  const createAnnouncement = useCreateAnnouncement()
  const uploadImage = useUploadAnnouncementImage()
  const { data: kiosks } = useKiosks()
  const { data: allLocations } = useLocations()

  const {
    register,
    control,
    handleSubmit,
    trigger,
    watch,
    setValue,
    reset: resetForm,
    formState: { errors, isSubmitting },
  } = useForm<NewAnnouncementFormValues>({
    resolver: zodResolver(newAnnouncementSchema),
    mode: "onTouched",
    reValidateMode: "onChange",
    defaultValues: {
      broadcast: false,
      kioskId: "",
      title: "",
      body: "",
      mediaUrl: "",
      startAt: toDatetimeLocal(new Date()),
      endAt: toDatetimeLocal(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)),
      repeatPolicy: "ONCE",
      maxDisplayCount: "3",
      locationIds: [],
    },
  })

  const broadcast = watch("broadcast")
  const kioskId = watch("kioskId")
  const title = watch("title")
  const body = watch("body")
  const mediaUrl = watch("mediaUrl")
  const repeatPolicy = watch("repeatPolicy")

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
    resetForm({
      broadcast: false,
      kioskId: "",
      title: "",
      body: "",
      mediaUrl: "",
      startAt: toDatetimeLocal(new Date()),
      endAt: toDatetimeLocal(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)),
      repeatPolicy: "ONCE",
      maxDisplayCount: "3",
      locationIds: [],
    })
  }

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) reset()
  }

  function handleUploadFile(file: File) {
    uploadImage.mutate(file, {
      onSuccess: (data) => setValue("mediaUrl", data.url),
      onError: (error) =>
        toast.error(error instanceof ApiError ? error.message : "Could not upload image."),
    })
  }

  async function handleContinue() {
    const fields = STEP_FIELDS[stepKey]
    if (fields && !(await trigger(fields))) return
    setStep(step + 1)
  }

  function onSubmit(values: NewAnnouncementFormValues) {
    createAnnouncement.mutate(
      {
        title: values.title,
        body: values.body,
        mediaUrl: values.mediaUrl || undefined,
        startAt: new Date(values.startAt).toISOString(),
        endAt: new Date(values.endAt).toISOString(),
        repeatPolicy: values.repeatPolicy,
        maxDisplayCount: values.repeatPolicy === "MAX_N_TIMES" ? Number(values.maxDisplayCount) : undefined,
        broadcast: values.broadcast,
        ...(values.broadcast ? {} : { kioskId: values.kioskId, locationIds: values.locationIds }),
      },
      {
        onSuccess: () => {
          toast.success(`${values.title} was created.`)
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
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{STEP_INFO[stepKey].title}</DialogTitle>
          <WizardStepDots count={stepKeys.length} current={step} steps={stepKeys.map((key) => STEP_INFO[key])} />
          <DialogDescription>{STEP_INFO[stepKey].description}</DialogDescription>
        </DialogHeader>

        <form
          className="flex flex-col justify-between"
          onSubmit={
            isLastStep
              ? handleSubmit(onSubmit)
              : (e) => {
                  e.preventDefault()
                  handleContinue()
                }
          }
          noValidate
        >
          <div className="flex flex-col gap-4 px-6">
            {stepKey === "content" && (
              <div className="grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
                <div className="flex flex-col gap-4">
                  <div className="flex items-center justify-between rounded-lg border border-black/8 p-3">
                    <div>
                      <Label htmlFor="new-ann-broadcast">Broadcast to all kiosks</Label>
                      <p className="text-sm text-muted-foreground">
                        Shows on every device across the entire platform.
                      </p>
                    </div>
                    <Controller
                      name="broadcast"
                      control={control}
                      render={({ field }) => (
                        <Switch id="new-ann-broadcast" checked={field.value} onCheckedChange={field.onChange} />
                      )}
                    />
                  </div>
                  <FormField label="Title" htmlFor="new-ann-title" error={errors.title?.message}>
                    <Input id="new-ann-title" {...register("title")} />
                  </FormField>
                  <FormField label="Body" htmlFor="new-ann-body" error={errors.body?.message}>
                    <Textarea id="new-ann-body" rows={4} {...register("body")} aria-invalid={!!errors.body} />
                  </FormField>
                  <FormField label="Image (optional)" htmlFor="new-ann-media">
                    <ImageUploadField
                      id="new-ann-media"
                      value={mediaUrl}
                      onChange={(url) => setValue("mediaUrl", url)}
                      onUploadFile={handleUploadFile}
                      isUploading={uploadImage.isPending}
                    />
                  </FormField>
                </div>
                <div className="md:sticky md:top-0 md:self-start">
                  <AnnouncementPreview title={title} body={body} mediaUrl={mediaUrl || undefined} />
                </div>
              </div>
            )}

            {stepKey === "kiosk" && (
              <FormField label="Kiosk" htmlFor="new-ann-kiosk" error={errors.kioskId?.message}>
                <Controller
                  name="kioskId"
                  control={control}
                  render={({ field, fieldState }) => (
                    <Combobox
                      id="new-ann-kiosk"
                      value={field.value}
                      onValueChange={field.onChange}
                      placeholder="Select a kiosk"
                      searchPlaceholder="Search kiosks..."
                      options={kiosks?.map((kiosk) => ({ value: kiosk.id, label: kiosk.name })) ?? []}
                      aria-invalid={!!fieldState.error}
                    />
                  )}
                />
              </FormField>
            )}

            {stepKey === "schedule" && (
              <>
                <FormGrid>
                  <FormField label="Starts" htmlFor="new-ann-start" error={errors.startAt?.message}>
                    <Controller
                      name="startAt"
                      control={control}
                      render={({ field, fieldState }) => (
                        <DateTimePicker
                          id="new-ann-start"
                          value={field.value}
                          onChange={field.onChange}
                          aria-invalid={!!fieldState.error}
                        />
                      )}
                    />
                  </FormField>
                  <FormField label="Ends" htmlFor="new-ann-end" error={errors.endAt?.message}>
                    <Controller
                      name="endAt"
                      control={control}
                      render={({ field, fieldState }) => (
                        <DateTimePicker
                          id="new-ann-end"
                          value={field.value}
                          onChange={field.onChange}
                          aria-invalid={!!fieldState.error}
                        />
                      )}
                    />
                  </FormField>
                </FormGrid>
                <FormField label="Repeat policy" htmlFor="new-ann-repeat">
                  <Controller
                    name="repeatPolicy"
                    control={control}
                    render={({ field }) => (
                      <Combobox
                        id="new-ann-repeat"
                        value={field.value}
                        onValueChange={field.onChange}
                        options={(Object.keys(REPEAT_LABEL) as AnnouncementRepeatPolicy[]).map((policy) => ({
                          value: policy,
                          label: REPEAT_LABEL[policy],
                        }))}
                      />
                    )}
                  />
                </FormField>
                {repeatPolicy === "MAX_N_TIMES" && (
                  <FormField
                    label="Display up to"
                    htmlFor="new-ann-max-count"
                    hint="Times per device, ever, across all logins."
                    error={errors.maxDisplayCount?.message}
                  >
                    <Input id="new-ann-max-count" type="number" min="1" {...register("maxDisplayCount")} />
                  </FormField>
                )}
              </>
            )}

            {stepKey === "targeting" && (
              <Controller
                name="locationIds"
                control={control}
                render={({ field }) => (
                  <LocationTargetPicker locations={kioskLocations} value={field.value} onChange={field.onChange} />
                )}
              />
            )}
          </div>

          <DialogFooter className="flex-row justify-end">
            {step > 0 && (
              <Button type="button" variant="outline" onClick={() => setStep(step - 1)}>
                Back
              </Button>
            )}
            <Button type="submit" disabled={isSubmitting}>
              {!isLastStep ? "Continue" : isSubmitting ? "Creating…" : "Create announcement"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
