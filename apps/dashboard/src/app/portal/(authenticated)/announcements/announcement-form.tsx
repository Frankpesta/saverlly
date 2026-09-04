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
import { useCurrentUser } from "@/lib/api/hooks/use-current-user"
import { ApiError } from "@/lib/api/client"
import { toDatetimeLocal } from "@/lib/format-date"
import type { AnnouncementRepeatPolicy } from "@/lib/api/types"
import { cn } from "@/lib/utils"
import {
  createDefaultLayout,
  createElementId,
  createEmptyLayout,
  isSafeImageUrl,
  type AnnouncementLayout,
  type AnnouncementLayoutElement,
  type LayoutElementType,
  type ShapeKind,
} from "@saverlly/shared-types"
import { AnnouncementCanvas, LayerList } from "./announcement-canvas"
import { AnnouncementLayoutPreview } from "./announcement-layout-preview"
import { CanvasToolbar, ElementInspector, createElement } from "./announcement-inspector"
import { LocationTargetPicker } from "./location-target-picker"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"

const REPEAT_POLICIES = ["ONCE", "EVERY_LOGIN", "MAX_N_TIMES"] as const

const REPEAT_LABEL: Record<AnnouncementRepeatPolicy, string> = {
  ONCE: "Once",
  EVERY_LOGIN: "Every login",
  MAX_N_TIMES: "A set number of times",
}

const announcementSchema = z
  .object({
    title: z.string().trim().min(1, "Title is required"),
    // Optional, and renamed to "Internal note" in the UI. It was required and labelled "Body",
    // which read like copy that would appear on the kiosk. It never was: what a kiosk shows
    // comes entirely from the layout.
    body: z.string().trim(),
    mediaUrl: z.string().trim(),
    startAt: z.string().min(1, "Start date is required"),
    endAt: z.string().min(1, "End date is required"),
    repeatPolicy: z.enum(REPEAT_POLICIES),
    maxDisplayCount: z.string().trim(),
    locationIds: z.array(z.string()),
    // The canvas design. Shape validation is the sanitizer's job (server-side too), so this only
    // asserts it's an object. Duplicating the element schema in zod would give two definitions
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

/**
 * The schema depends on who is filling it in: an empty `locationIds` means "every location in
 * the kiosk", which only the owner may do. Built per-role rather than checked after submit, so a
 * manager sees the requirement on the field instead of a 403 toast at the end.
 */
function makeAnnouncementSchema(canTargetAllLocations: boolean) {
  if (canTargetAllLocations) return announcementSchema
  return announcementSchema.superRefine((data, ctx) => {
    if (data.locationIds.length === 0) {
      ctx.addIssue({
        code: "custom",
        message: "Pick at least one of your locations",
        path: ["locationIds"],
      })
    }
  })
}

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
    body: values.body || undefined,
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
 * The whole announcement on one page. Content, schedule and targeting all visible at once with
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
  const { data: currentUser } = useCurrentUser()
  // A manager's own `useLocations()` is already scoped to their managedLocationIds, so the list
  // below is theirs. What they can't do is leave it empty, which the backend reads as "every
  // location in the kiosk".
  const canTargetAllLocations = currentUser?.role !== "LOCATION_MANAGER"

  const {
    register,
    control,
    handleSubmit,
    watch,
    getValues,
    setValue,
    formState: { errors },
  } = useForm<AnnouncementFormValues>({
    resolver: zodResolver(makeAnnouncementSchema(canTargetAllLocations)),
    mode: "onTouched",
    reValidateMode: "onChange",
    defaultValues,
  })

  // Only the values that actually drive rendering are watched. Title/body/mediaUrl are plain
  // registered inputs read on demand via getValues(). Watching them would re-render the canvas,
  // inspector and preview iframe on every single keystroke, which is both wasteful and, because
  // react-hook-form's `watch` makes React Compiler bail out of memoizing this component
  // entirely, genuinely slow to type into.
  const repeatPolicy = watch("repeatPolicy")
  const layout = watch("layout")
  // Watched so the toolbar's drop zone shows a thumbnail of the image just uploaded. It changes
  // on an upload, not on a keystroke, so this costs nothing in typing responsiveness.
  const mediaUrl = watch("mediaUrl") ?? ""

  const [selectedId, setSelectedId] = React.useState<string | null>(null)

  function setLayout(next: AnnouncementLayout) {
    setValue("layout", next, { shouldDirty: true })
  }

  /**
   * A new image element, sized to fit the canvas and centred on it.
   *
   * The upload path used to hardcode `x:240, y:150, 480×300`. Those are leftovers from the old
   * 960×640 full-screen canvas, so on the 400×520 toast the image landed almost entirely off the
   * right edge and was clipped away by the stage's `overflow: hidden`. Which is exactly the
   * "the image doesn't show up" the client reported.
   */
  function imageElementFor(url: string): AnnouncementLayoutElement {
    const width = Math.round(layout.width * 0.8)
    const height = Math.round(Math.min(layout.height * 0.5, width * 0.625))
    return {
      id: createElementId("image"),
      type: "image",
      x: Math.round((layout.width - width) / 2),
      y: Math.round((layout.height - height) / 2),
      width,
      height,
      url,
      fit: "cover",
      radius: 12,
    }
  }

  function addImage(url: string) {
    const element = imageElementFor(url)
    setLayout({ ...layout, elements: [...layout.elements, element] })
    setSelectedId(element.id)
  }

  /** Uploading from the canvas toolbar drops the image straight onto the canvas. `mediaUrl` is
   *  tracked alongside it as the fallback thumbnail for pre-canvas rendering, and as the value
   *  the toolbar's own preview shows. */
  function handleUploadFile(file: File) {
    uploadImage.mutate(file, {
      onSuccess: (data) => {
        if (!isSafeImageUrl(data.url)) {
          toast.error("That image URL can't be used on a kiosk screen.")
          return
        }
        setValue("mediaUrl", data.url, { shouldDirty: true })
        addImage(data.url)
      },
      onError: (error) =>
        toast.error(error instanceof ApiError ? error.message : "Could not upload image."),
    })
  }

  function handleAddElement(type: LayoutElementType) {
    const element = createElement(type, layout)
    if (!element) return
    setLayout({ ...layout, elements: [...layout.elements, element] })
    setSelectedId(element.id)
  }

  function handleAddShape(kind: ShapeKind) {
    const element = createElement("shape", layout, kind)
    if (!element) return
    setLayout({ ...layout, elements: [...layout.elements, element] })
    setSelectedId(element.id)
  }

  function handleResetLayout() {
    const { title, body, mediaUrl } = getValues()
    setLayout(createDefaultLayout({ title, body, mediaUrl }))
    setSelectedId(null)
  }

  /** Distinct from "Reset": reset rebuilds a title/body/button arrangement, this leaves nothing
   *  behind. The canvas size and background are kept, since those are the frame rather than the
   *  content. Confirmed, because it discards work with no undo. */
  function handleClearCanvas() {
    setLayout(
      createEmptyLayout({
        background: layout.background,
        width: layout.width,
        height: layout.height,
      }),
    )
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
          <h2 className="text-title">{heading}</h2>
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
            description="Drag to move, use the corner handles to resize, and arrow keys to nudge. This is the notification card that slides into the bottom-right corner of the kiosk screen, at the size it appears there."
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
                onAddShape={handleAddShape}
                onUploadFile={handleUploadFile}
                isUploading={uploadImage.isPending}
                // The real uploaded URL, so the toolbar shows a thumbnail of what was just added.
                // It was hardcoded to "" here, which left the drop zone looking as though nothing
                // had happened even when the upload had succeeded.
                imageUrl={mediaUrl}
                onImageUrlChange={(url) => {
                  if (!url) {
                    setValue("mediaUrl", "", { shouldDirty: true })
                    return
                  }
                  if (!isSafeImageUrl(url)) return
                  setValue("mediaUrl", url, { shouldDirty: true })
                  addImage(url)
                }}
              />
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <button
                type="button"
                onClick={handleResetLayout}
                className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              >
                Reset to a default layout built from the title
              </button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <button
                    type="button"
                    className="text-xs text-muted-foreground underline-offset-2 hover:text-destructive hover:underline"
                  >
                    Clear the canvas
                  </button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Clear the canvas?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Everything you have drawn is removed and you start from a blank canvas. The
                      size and background colour stay as they are. This can&apos;t be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleClearCanvas}
                      className="bg-destructive text-white hover:bg-destructive/90"
                    >
                      Clear canvas
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </FormSection>

          <FormSection
            label="Details"
            description="Never drawn on the kiosk screen. This is how the announcement is listed and searched in your dashboard."
          >
            <FormField label="Title" htmlFor="ann-title" error={errors.title?.message}>
              <Input id="ann-title" {...register("title")} />
            </FormField>
            {/* Was a required field labelled "Body", which read like copy the kiosk would show.
                It never was, and it is optional now. */}
            <FormField
              label="Internal note"
              htmlFor="ann-body"
              hint="Optional. Only you see this, in the dashboard list."
              error={errors.body?.message}
            >
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
                  canTargetAllLocations={canTargetAllLocations}
                />
              )}
            />
            {errors.locationIds && (
              <p className="text-xs text-destructive">{errors.locationIds.message}</p>
            )}
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
