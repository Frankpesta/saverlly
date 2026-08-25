"use client"

import * as React from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { toast } from "sonner"
import { ArrowLeftIcon, RadioIcon, Trash2Icon } from "lucide-react"
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
import { Badge } from "@/components/ui/badge"
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { DateTimePicker } from "@/components/dashboard/date-time-picker"
import { FormField, FormGrid } from "@/components/dashboard/form-section"
import {
  useAnnouncement,
  useDeleteAnnouncement,
  useUpdateAnnouncement,
  useUploadAnnouncementImage,
} from "@/lib/api/hooks/use-announcements"
import { useKiosks } from "@/lib/api/hooks/use-kiosks"
import { useLocations } from "@/lib/api/hooks/use-locations"
import { ApiError } from "@/lib/api/client"
import { toDatetimeLocal } from "@/lib/format-date"
import type { Announcement, AnnouncementRepeatPolicy } from "@/lib/api/types"
import { AnnouncementPreview } from "../announcement-preview"
import { LocationTargetPicker } from "../location-target-picker"

const REPEAT_LABEL: Record<AnnouncementRepeatPolicy, string> = {
  ONCE: "Once",
  EVERY_LOGIN: "Every login",
  MAX_N_TIMES: "A set number of times",
}

export default function AdminAnnouncementDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { data: announcement, isLoading, isError } = useAnnouncement(id)
  const deleteAnnouncement = useDeleteAnnouncement()

  function handleDelete() {
    deleteAnnouncement.mutate(id, {
      onSuccess: () => {
        toast.success("Announcement deleted.")
        router.push("/admin/announcements")
      },
      onError: (error) =>
        toast.error(error instanceof ApiError ? error.message : "Could not delete announcement."),
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 border-b border-black/[0.09] pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-3">
          <Link href="/admin/announcements" className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeftIcon className="size-4" />
            Announcements
          </Link>
          <div>
            <p className="text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">Announcement</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight">{announcement?.title ?? "Announcement"}</h2>
          </div>
        </div>
        {announcement && (
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

      {announcement && (
        <div className="grid grid-cols-1 items-start gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          <AnnouncementEditForm key={announcement.id} announcement={announcement} />
        </div>
      )}
    </div>
  )
}

function AnnouncementEditForm({ announcement }: { announcement: Announcement }) {
  const isBroadcast = announcement.kioskId === null
  const updateAnnouncement = useUpdateAnnouncement(announcement.id)
  const uploadImage = useUploadAnnouncementImage()
  const { data: kiosks } = useKiosks()
  const { data: allLocations } = useLocations()
  const fileInputRef = React.useRef<HTMLInputElement>(null)

  const kioskName = kiosks?.find((k) => k.id === announcement.kioskId)?.name
  const kioskLocations = React.useMemo(
    () => (allLocations ?? []).filter((l) => l.kioskId === announcement.kioskId),
    [allLocations, announcement.kioskId],
  )

  const [title, setTitle] = React.useState(announcement.title)
  const [body, setBody] = React.useState(announcement.body)
  const [mediaUrl, setMediaUrl] = React.useState(announcement.mediaUrl ?? "")
  const [startAt, setStartAt] = React.useState(() => toDatetimeLocal(announcement.startAt))
  const [endAt, setEndAt] = React.useState(() => toDatetimeLocal(announcement.endAt))
  const [repeatPolicy, setRepeatPolicy] = React.useState(announcement.repeatPolicy)
  const [maxDisplayCount, setMaxDisplayCount] = React.useState(
    String(announcement.maxDisplayCount ?? 3),
  )
  const [locationIds, setLocationIds] = React.useState(announcement.locationIds)

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

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    updateAnnouncement.mutate(
      {
        title,
        body,
        mediaUrl: mediaUrl || undefined,
        startAt: new Date(startAt).toISOString(),
        endAt: new Date(endAt).toISOString(),
        repeatPolicy,
        maxDisplayCount: repeatPolicy === "MAX_N_TIMES" ? Number(maxDisplayCount) : undefined,
        ...(isBroadcast ? {} : { locationIds }),
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
          <div className="flex items-center justify-between">
            <CardTitle>Content</CardTitle>
            {isBroadcast ? (
              <Badge variant="info" className="gap-1">
                <RadioIcon className="size-3" />
                All kiosks
              </Badge>
            ) : (
              <Badge variant="secondary">{kioskName ?? "Unknown kiosk"}</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <FormField label="Title" htmlFor="ann-title">
            <Input id="ann-title" value={title} onChange={(e) => setTitle(e.target.value)} required />
          </FormField>
          <FormField label="Body" htmlFor="ann-body">
            <Textarea
              id="ann-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={4}
              required
            />
          </FormField>
          <FormField label="Image (optional)" htmlFor="ann-media">
            <div className="flex gap-2">
              <Input
                id="ann-media"
                type="url"
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{isBroadcast ? "Schedule" : "Schedule & targeting"}</CardTitle>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="flex flex-col gap-4">
            <FormGrid>
              <FormField label="Starts" htmlFor="ann-start">
                <DateTimePicker id="ann-start" value={startAt} onChange={setStartAt} required />
              </FormField>
              <FormField label="Ends" htmlFor="ann-end">
                <DateTimePicker id="ann-end" value={endAt} onChange={setEndAt} required />
              </FormField>
            </FormGrid>
            <FormField label="Repeat policy" htmlFor="ann-repeat">
              <Select
                value={repeatPolicy}
                onValueChange={(v) => setRepeatPolicy(v as AnnouncementRepeatPolicy)}
              >
                <SelectTrigger id="ann-repeat" className="w-full">
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
              <FormField label="Display up to" htmlFor="ann-max-count">
                <Input
                  id="ann-max-count"
                  type="number"
                  min="1"
                  value={maxDisplayCount}
                  onChange={(e) => setMaxDisplayCount(e.target.value)}
                  required
                />
              </FormField>
            )}
            {!isBroadcast && (
              <LocationTargetPicker
                locations={kioskLocations}
                value={locationIds}
                onChange={setLocationIds}
              />
            )}
          </CardContent>
          <CardFooter>
            <Button type="submit" disabled={updateAnnouncement.isPending}>
              {updateAnnouncement.isPending ? "Saving…" : "Save changes"}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </>
  )
}
