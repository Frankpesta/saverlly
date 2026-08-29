"use client"

import * as React from "react"
import { toast } from "sonner"
import { PlusIcon } from "lucide-react"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
import { useCreateAnnouncement, useUploadAnnouncementImage } from "@/lib/api/hooks/use-announcements"
import { useLocations } from "@/lib/api/hooks/use-locations"
import { ApiError } from "@/lib/api/client"
import { toDatetimeLocal } from "@/lib/format-date"
import type { AnnouncementRepeatPolicy } from "@/lib/api/types"
import { AnnouncementPreview } from "./announcement-preview"
import { LocationTargetPicker } from "./location-target-picker"

const REPEAT_POLICIES = ["ONCE", "EVERY_LOGIN", "MAX_N_TIMES"] as const

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

const newAnnouncementSchema = z
  .object({
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
  const { data: locations } = useLocations()
  const fileInputRef = React.useRef<HTMLInputElement>(null)

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

  const title = watch("title")
  const body = watch("body")
  const mediaUrl = watch("mediaUrl")
  const repeatPolicy = watch("repeatPolicy")

  function reset() {
    setStep(0)
    resetForm({
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

  function handleFileSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) return
    uploadImage.mutate(file, {
      onSuccess: (data) => setValue("mediaUrl", data.url),
      onError: (error) =>
        toast.error(error instanceof ApiError ? error.message : "Could not upload image."),
    })
  }

  async function handleContinue() {
    const fields =
      step === 0 ? (["title", "body"] as const) : (["startAt", "endAt", "repeatPolicy", "maxDisplayCount"] as const)
    if (!(await trigger(fields))) return
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
        locationIds: values.locationIds,
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{STEPS[step].title}</DialogTitle>
          <WizardStepDots count={STEPS.length} current={step} steps={STEPS} />
          <DialogDescription>{STEPS[step].description}</DialogDescription>
        </DialogHeader>

        <form
          className="flex flex-col justify-between"
          onSubmit={
            step < 2
              ? (e) => {
                  e.preventDefault()
                  handleContinue()
                }
              : handleSubmit(onSubmit)
          }
          noValidate
        >
          <div className="flex flex-col gap-4 px-6">
            {step === 0 && (
              <>
                <FormField label="Title" htmlFor="new-ann-title" error={errors.title?.message}>
                  <Input id="new-ann-title" {...register("title")} />
                </FormField>
                <FormField label="Body" htmlFor="new-ann-body" error={errors.body?.message}>
                  <Textarea id="new-ann-body" rows={4} {...register("body")} aria-invalid={!!errors.body} />
                </FormField>
                <FormField label="Image (optional)" htmlFor="new-ann-media">
                  <div className="flex gap-2">
                    <Input id="new-ann-media" type="url" placeholder="https://…" {...register("mediaUrl")} />
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

            {step === 1 && (
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

            {step === 2 && (
              <Controller
                name="locationIds"
                control={control}
                render={({ field }) => (
                  <LocationTargetPicker locations={locations ?? []} value={field.value} onChange={field.onChange} />
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
              {step < 2 ? "Continue" : isSubmitting ? "Creating…" : "Create announcement"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
