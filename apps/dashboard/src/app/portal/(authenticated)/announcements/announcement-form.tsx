"use client"

import * as React from "react"
import Link from "next/link"
import { toast } from "sonner"
import { ArrowLeftIcon } from "lucide-react"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Button, buttonVariants } from "@/components/ui/button"
import { Combobox } from "@/components/ui/combobox"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { DateTimePicker } from "@/components/dashboard/date-time-picker"
import { FormField, FormGrid, FormSection } from "@/components/dashboard/form-section"
import { useUploadAnnouncementImage } from "@/lib/api/hooks/use-announcements"
import type { AnnouncementPayload } from "@/lib/api/hooks/use-announcements"
import { useLocations } from "@/lib/api/hooks/use-locations"
import { ApiError } from "@/lib/api/client"
import { toDatetimeLocal } from "@/lib/format-date"
import type { AnnouncementRepeatPolicy } from "@/lib/api/types"
import { cn } from "@/lib/utils"
import {
  createDefaultLayout,
  createElementId,
  isSafeImageUrl,
  type AnnouncementLayout,
  type AnnouncementLayoutElement,
  type LayoutElementType,
} from "@saverlly/shared-types"
import { AnnouncementCanvas, LayerList } from "./announcement-canvas"
import { AnnouncementLayoutPreview } from "./announcement-layout-preview"
import { CanvasToolbar, ElementInspector, createElement } from "./announcement-inspector"
import { LocationTargetPicker } from "./location-target-picker"

const REPEAT_POLICIES = ["ONCE", "EVERY_LOGIN", "MAX_N_TIMES"] as const

const REPEAT_LABEL: Record<AnnouncementRepeatPolicy, string> = {
  ONCE: "Once",
  EVERY_LOGIN: "Every login",
  MAX_N_TIMES: "A set number of times",
}

const announcementSchema = z
  .object({
    title: z.string().trim().min(1, "Title is required"),
    body: z.string().trim().min(1, "Body is required"),
    mediaUrl: z.string().trim(),
    startAt: z.string().min(1, "Start date is required"),
    endAt: z.string().min(1, "End date is required"),
    repeatPolicy: z.enum(REPEAT_POLICIES),
    maxDisplayCount: z.string().trim(),
    locationIds: z.array(z.string()),
    // The canvas design. Shape validation is the sanitizer's job (server-side too), so this only
    // asserts it's an object — duplicating the element schema in zod would give two definitions
    // of a layout that could disagree.
    layout: z.custom<AnnouncementLayout>(
      (value) => typeof value === "object" && value !== null,
      "A layout is required",
    ),
  })
  .superRefine((data, ctx) => {
    if (data.repeatPolicy === "MAX_N_TIMES") {
      const n = Number(data.maxDisplayCount)
      if (!data.maxDisplayCount || Number.isNaN(n) || n < 1) {
        ctx.addIssue({
          code: "custom",
          message: "Enter a number of at least 1",
          path: ["maxDisplayCount"],
        })
      }
    }
    // Mirrors AnnouncementsService's own check, so the error lands on the field instead of
    // arriving as a toast after a round-trip.
    if (data.startAt && data.endAt && new Date(data.endAt) <= new Date(data.startAt)) {
      ctx.addIssue({ code: "custom", message: "End must be after the start", path: ["endAt"] })
    }
  })

export type AnnouncementFormValues = z.infer<typeof announcementSchema>

export function emptyAnnouncementForm(): AnnouncementFormValues {
  return {
    title: "",
    body: "",
    mediaUrl: "",
    startAt: toDatetimeLocal(new Date()),
    endAt: toDatetimeLocal(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)),
    repeatPolicy: "ONCE",
    maxDisplayCount: "3",
    locationIds: [],
    layout: createDefaultLayout({ title: "Your headline", body: "Say a bit more here." }),
  }
}

export function toAnnouncementPayload(values: AnnouncementFormValues): AnnouncementPayload {
  return {
    title: values.title,
    body: values.body,
    mediaUrl: values.mediaUrl || undefined,
    startAt: new Date(values.startAt).toISOString(),
    endAt: new Date(values.endAt).toISOString(),
    repeatPolicy: values.repeatPolicy,
    maxDisplayCount:
      values.repeatPolicy === "MAX_N_TIMES" ? Number(values.maxDisplayCount) : undefined,
    locationIds: values.locationIds,
    layout: values.layout,
  }
}

/**
 * The whole announcement on one page — content, schedule and targeting all visible at once with
 * the kiosk-screen preview pinned alongside, rather than the stepped dialog this replaced. What
 * the announcement *looks like* is the point of the exercise, so a preview that stays on screen
 * while the schedule and targeting are filled in is worth more than the wizard's hand-holding.
 * Shared by `new/page.tsx` and `[id]/page.tsx` so create and edit can't drift apart.
 */
export function AnnouncementForm({
  defaultValues,
  submitLabel,
  pendingLabel,
  heading,
  description,
  onSubmit,
  isPending,
  headerActions,
}: {
  defaultValues: AnnouncementFormValues
  submitLabel: string
  pendingLabel: string
  heading: string
  description: string
  onSubmit: (values: AnnouncementFormValues) => void
  isPending: boolean
  headerActions?: React.ReactNode
}) {
  const uploadImage = useUploadAnnouncementImage()
  const { data: locations } = useLocations()

  const {
    register,
    control,
    handleSubmit,
    watch,
    getValues,
    setValue,
    formState: { errors },
  } = useForm<AnnouncementFormValues>({
    resolver: zodResolver(announcementSchema),
    mode: "onTouched",
    reValidateMode: "onChange",
    defaultValues,
  })

  // Only the values that actually drive rendering are watched. Title/body/mediaUrl are plain
  // registered inputs read on demand via getValues() — watching them would re-render the canvas,
  // inspector and preview iframe on every single keystroke, which is both wasteful and, because
  // react-hook-form's `watch` makes React Compiler bail out of memoizing this component
  // entirely, genuinely slow to type into.
  const repeatPolicy = watch("repeatPolicy")
  const layout = watch("layout")

  const [selectedId, setSelectedId] = React.useState<string | null>(null)

  function setLayout(next: AnnouncementLayout) {
    setValue("layout", next, { shouldDirty: true })
  }

  /** Uploading from the canvas toolbar drops the image straight onto the canvas — the upload
   *  field is an "add an image" affordance there, not a value to hold on to, so it's cleared
   *  again immediately. `mediaUrl` is still tracked separately as the fallback thumbnail for
   *  pre-canvas rendering. */
  function handleUploadFile(file: File) {
    uploadImage.mutate(file, {
      onSuccess: (data) => {
        if (!isSafeImageUrl(data.url)) {
          toast.error("That image URL can't be used on a kiosk screen.")
          return
        }
        setValue("mediaUrl", data.url)
        const element: AnnouncementLayoutElement = {
          id: createElementId("image"),
          type: "image",
          x: 240,
          y: 150,
          width: 480,
          height: 300,
          url: data.url,
          fit: "cover",
          radius: 12,
        }
        setLayout({ ...layout, elements: [...layout.elements, element] })
        setSelectedId(element.id)
      },
      onError: (error) =>
        toast.error(error instanceof ApiError ? error.message : "Could not upload image."),
    })
  }

  function handleAddElement(type: LayoutElementType) {
    const element = createElement(type)
    if (!element) return
    setLayout({ ...layout, elements: [...layout.elements, element] })
    setSelectedId(element.id)
  }

  function handleResetLayout() {
    const { title, body, mediaUrl } = getValues()
    setLayout(createDefaultLayout({ title, body, mediaUrl }))
    setSelectedId(null)
  }

  return (
    <form className="flex flex-col gap-6" onSubmit={handleSubmit(onSubmit)} noValidate>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <Link
            href="/portal/announcements"
            className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeftIcon className="size-3.5" />
            Announcements
          </Link>
          <h2 className="text-2xl font-semibold tracking-tight">{heading}</h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <div className="flex items-center gap-2">
          {headerActions}
          <Link href="/portal/announcements" className={cn(buttonVariants({ variant: "outline" }))}>
            Cancel
          </Link>
          <Button type="submit" disabled={isPending}>
            {isPending ? pendingLabel : submitLabel}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)]">
        <div className="flex flex-col gap-8">
          <FormSection
            label="Design"
            description="Drag to move, use the corner handles to resize, and arrow keys to nudge. This is exactly what appears on the kiosk screen."
          >
            <AnnouncementCanvas
              layout={layout}
              onChange={setLayout}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
            <div className="flex items-center justify-between gap-3">
              <CanvasToolbar
                onAdd={handleAddElement}
                onUploadFile={handleUploadFile}
                isUploading={uploadImage.isPending}
                imageUrl=""
                onImageUrlChange={(url) => {
                  if (!isSafeImageUrl(url)) return
                  const element: AnnouncementLayoutElement = {
                    id: createElementId("image"),
                    type: "image",
                    x: 240,
                    y: 150,
                    width: 480,
                    height: 300,
                    url,
                    fit: "cover",
                    radius: 12,
                  }
                  setLayout({ ...layout, elements: [...layout.elements, element] })
                  setSelectedId(element.id)
                }}
              />
            </div>
            <button
              type="button"
              onClick={handleResetLayout}
              className="w-fit text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              Reset the canvas to a default layout built from the title and body
            </button>
          </FormSection>

          <FormSection
            label="Details"
            description="Not drawn on the kiosk screen — this is how the announcement is listed and searched in your dashboard."
          >
            <FormField label="Title" htmlFor="ann-title" error={errors.title?.message}>
              <Input id="ann-title" {...register("title")} />
            </FormField>
            <FormField label="Body" htmlFor="ann-body" error={errors.body?.message}>
              <Textarea id="ann-body" rows={3} {...register("body")} aria-invalid={!!errors.body} />
            </FormField>
          </FormSection>

          <FormSection label="Schedule">
            <FormGrid>
              <FormField label="Starts" htmlFor="ann-start" error={errors.startAt?.message}>
                <Controller
                  name="startAt"
                  control={control}
                  render={({ field, fieldState }) => (
                    <DateTimePicker
                      id="ann-start"
                      value={field.value}
                      onChange={field.onChange}
                      aria-invalid={!!fieldState.error}
                    />
                  )}
                />
              </FormField>
              <FormField label="Ends" htmlFor="ann-end" error={errors.endAt?.message}>
                <Controller
                  name="endAt"
                  control={control}
                  render={({ field, fieldState }) => (
                    <DateTimePicker
                      id="ann-end"
                      value={field.value}
                      onChange={field.onChange}
                      aria-invalid={!!fieldState.error}
                    />
                  )}
                />
              </FormField>
            </FormGrid>
            <FormField
              label="Repeat policy"
              htmlFor="ann-repeat"
              hint="How often a device shows this to the same person."
            >
              <Controller
                name="repeatPolicy"
                control={control}
                render={({ field }) => (
                  <Combobox
                    id="ann-repeat"
                    value={field.value}
                    onValueChange={field.onChange}
                    options={(Object.keys(REPEAT_LABEL) as AnnouncementRepeatPolicy[]).map(
                      (policy) => ({ value: policy, label: REPEAT_LABEL[policy] }),
                    )}
                  />
                )}
              />
            </FormField>
            {repeatPolicy === "MAX_N_TIMES" && (
              <FormField
                label="Display up to"
                htmlFor="ann-max-count"
                hint="Times per device, ever, across all logins."
                error={errors.maxDisplayCount?.message}
              >
                <Input id="ann-max-count" type="number" min="1" {...register("maxDisplayCount")} />
              </FormField>
            )}
          </FormSection>

          <FormSection label="Targeting">
            <Controller
              name="locationIds"
              control={control}
              render={({ field }) => (
                <LocationTargetPicker
                  locations={locations ?? []}
                  value={field.value}
                  onChange={field.onChange}
                />
              )}
            />
          </FormSection>
        </div>

        {/* Pinned so the inspector stays reachable while dragging on the canvas, and so the
            preview stays in view while the schedule and targeting sections are filled in. */}
        <div className="flex flex-col gap-6 lg:sticky lg:top-6 lg:self-start">
          <div className="rounded-xl border border-black/8 bg-card p-4 dark:border-white/10">
            <ElementInspector
              layout={layout}
              selectedId={selectedId}
              onChange={setLayout}
              onSelect={setSelectedId}
            />
          </div>

          <div className="rounded-xl border border-black/8 bg-card p-4 dark:border-white/10">
            <p className="mb-2 text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">
              Layers
            </p>
            <LayerList layout={layout} selectedId={selectedId} onSelect={setSelectedId} />
          </div>

          <AnnouncementLayoutPreview layout={layout} />
        </div>
      </div>
    </form>
  )
}
