"use client"

import * as React from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { toast } from "sonner"
import { ArrowLeftIcon, Trash2Icon } from "lucide-react"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
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
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Combobox,
} from "@/components/ui/combobox"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { DateTimePicker } from "@/components/dashboard/date-time-picker"
import { FormField, FormGrid } from "@/components/dashboard/form-section"
import { ImageUploadField } from "@/components/dashboard/image-upload-field"
import {
  useAnnouncement,
  useDeleteAnnouncement,
  useUpdateAnnouncement,
  useUploadAnnouncementImage,
} from "@/lib/api/hooks/use-announcements"
import { useCurrentUser } from "@/lib/api/hooks/use-current-user"
import { useLocations } from "@/lib/api/hooks/use-locations"
import { ApiError } from "@/lib/api/client"
import { toDatetimeLocal } from "@/lib/format-date"
import type { Announcement, AnnouncementRepeatPolicy } from "@/lib/api/types"
import { AnnouncementPreview } from "../announcement-preview"
import { LocationTargetPicker } from "../location-target-picker"
import { AnnouncementReadOnlyView } from "./announcement-readonly-view"

const REPEAT_POLICIES = ["ONCE", "EVERY_LOGIN", "MAX_N_TIMES"] as const

const REPEAT_LABEL: Record<AnnouncementRepeatPolicy, string> = {
  ONCE: "Once",
  EVERY_LOGIN: "Every login",
  MAX_N_TIMES: "A set number of times",
}

const announcementEditSchema = z
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

type AnnouncementEditFormValues = z.infer<typeof announcementEditSchema>

export default function AnnouncementDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { data: announcement, isLoading: announcementLoading, isError } = useAnnouncement(id)
  const { data: currentUser, isLoading: userLoading } = useCurrentUser()
  const deleteAnnouncement = useDeleteAnnouncement()
  const isLoading = announcementLoading || userLoading

  // A location manager never has edit rights on announcements, and a kiosk owner can't edit a
  // platform-wide admin broadcast (kioskId null) — TenantScopeGuard denies mutating those for
  // anyone but ADMIN, even though everyone in scope can view/preview them.
  const canEdit = currentUser?.role !== "LOCATION_MANAGER" && announcement?.kioskId !== null

  function handleDelete() {
    deleteAnnouncement.mutate(id, {
      onSuccess: () => {
        toast.success("Announcement deleted.")
        router.push("/portal/announcements")
      },
      onError: (error) =>
        toast.error(error instanceof ApiError ? error.message : "Could not delete announcement."),
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 border-b border-black/[0.09] dark:border-white/10 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-3">
          <Link href="/portal/announcements" className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeftIcon className="size-4" />
            Announcements
          </Link>
          <div>
            <p className="text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">Announcement</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight">{announcement?.title ?? "Announcement"}</h2>
          </div>
        </div>
        {announcement && canEdit && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5 text-destructive">
                <Trash2Icon className="size-4" />
                Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this announcement?</AlertDialogTitle>
                <AlertDialogDescription>
                  {announcement.title} will stop showing on kiosk screens immediately. This
                  can&apos;t be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDelete}
                  className="bg-destructive text-white hover:bg-destructive/90"
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>

      {isError && <p className="text-sm text-destructive">Could not load this announcement.</p>}
      {isLoading && <Skeleton className="h-64 w-full max-w-lg" />}

      {announcement && canEdit && (
        <div className="grid grid-cols-1 items-start gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          <AnnouncementEditForm key={announcement.id} announcement={announcement} />
        </div>
      )}

      {announcement && !canEdit && (
        <div className="max-w-md">
          <AnnouncementReadOnlyView announcement={announcement} />
        </div>
      )}
    </div>
  )
}

function AnnouncementEditForm({ announcement }: { announcement: Announcement }) {
  const updateAnnouncement = useUpdateAnnouncement(announcement.id)
  const uploadImage = useUploadAnnouncementImage()
  const { data: locations } = useLocations()
  const {
    register,
    control,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<AnnouncementEditFormValues>({
    resolver: zodResolver(announcementEditSchema),
    mode: "onTouched",
    reValidateMode: "onChange",
    defaultValues: {
      title: announcement.title,
      body: announcement.body,
      mediaUrl: announcement.mediaUrl ?? "",
      startAt: toDatetimeLocal(announcement.startAt),
      endAt: toDatetimeLocal(announcement.endAt),
      repeatPolicy: announcement.repeatPolicy,
      maxDisplayCount: String(announcement.maxDisplayCount ?? 3),
      locationIds: announcement.locationIds,
    },
  })

  const title = watch("title")
  const body = watch("body")
  const mediaUrl = watch("mediaUrl")
  const repeatPolicy = watch("repeatPolicy")

  function handleUploadFile(file: File) {
    uploadImage.mutate(file, {
      onSuccess: (data) => setValue("mediaUrl", data.url),
      onError: (error) =>
        toast.error(error instanceof ApiError ? error.message : "Could not upload image."),
    })
  }

  function onSubmit(values: AnnouncementEditFormValues) {
    updateAnnouncement.mutate(
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
        onSuccess: () => toast.success("Announcement updated."),
        onError: (error) =>
          toast.error(
            error instanceof ApiError ? error.message : "Could not update announcement.",
          ),
      },
    )
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Content</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <FormField label="Title" htmlFor="ann-title" error={errors.title?.message}>
            <Input id="ann-title" {...register("title")} />
          </FormField>
          <FormField label="Body" htmlFor="ann-body" error={errors.body?.message}>
            <Textarea id="ann-body" rows={4} {...register("body")} aria-invalid={!!errors.body} />
          </FormField>
          <FormField label="Image (optional)" htmlFor="ann-media">
            <ImageUploadField
              id="ann-media"
              value={mediaUrl}
              onChange={(url) => setValue("mediaUrl", url)}
              onUploadFile={handleUploadFile}
              isUploading={uploadImage.isPending}
            />
          </FormField>
          <AnnouncementPreview title={title} body={body} mediaUrl={mediaUrl || undefined} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Schedule &amp; targeting</CardTitle>
        </CardHeader>
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="contents">
          <CardContent className="flex flex-col gap-4">
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
            <FormField label="Repeat policy" htmlFor="ann-repeat">
              <Controller
                name="repeatPolicy"
                control={control}
                render={({ field }) => (
                  <Combobox
                    id="ann-repeat"
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
              <FormField label="Display up to" htmlFor="ann-max-count" error={errors.maxDisplayCount?.message}>
                <Input id="ann-max-count" type="number" min="1" {...register("maxDisplayCount")} />
              </FormField>
            )}
            <Controller
              name="locationIds"
              control={control}
              render={({ field }) => (
                <LocationTargetPicker locations={locations ?? []} value={field.value} onChange={field.onChange} />
              )}
            />
          </CardContent>
          <CardFooter>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving…" : "Save changes"}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </>
  )
}
