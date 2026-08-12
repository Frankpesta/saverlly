"use client"

import * as React from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { toast } from "sonner"
import { ArrowLeftIcon, Trash2Icon } from "lucide-react"
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
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import {
  useAnnouncement,
  useDeleteAnnouncement,
  useUpdateAnnouncement,
  useUploadAnnouncementImage,
} from "@/lib/api/hooks/use-announcements"
import { useLocations } from "@/lib/api/hooks/use-locations"
import { ApiError } from "@/lib/api/client"
import type { Announcement, AnnouncementRepeatPolicy } from "@/lib/api/types"
import { AnnouncementPreview } from "../announcement-preview"
import { LocationTargetPicker } from "../location-target-picker"

const REPEAT_LABEL: Record<AnnouncementRepeatPolicy, string> = {
  ONCE: "Once",
  EVERY_LOGIN: "Every login",
  MAX_N_TIMES: "A set number of times",
}

function toDatetimeLocal(iso: string): string {
  const date = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export default function AnnouncementDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { data: announcement, isLoading, isError } = useAnnouncement(id)
  const deleteAnnouncement = useDeleteAnnouncement()

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
      <div className="flex items-center justify-between">
        <Link
          href="/portal/announcements"
          className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:underline"
        >
          <ArrowLeftIcon className="size-4" />
          Back to Announcements
        </Link>
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
        <div className="flex flex-wrap items-start gap-6">
          <AnnouncementEditForm key={announcement.id} announcement={announcement} />
        </div>
      )}
    </div>
  )
}

function AnnouncementEditForm({ announcement }: { announcement: Announcement }) {
  const updateAnnouncement = useUpdateAnnouncement(announcement.id)
  const uploadImage = useUploadAnnouncementImage()
  const { data: locations } = useLocations()
  const fileInputRef = React.useRef<HTMLInputElement>(null)

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
        locationIds,
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
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>Content</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="ann-title">Title</Label>
            <Input id="ann-title" value={title} onChange={(e) => setTitle(e.target.value)} required />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="ann-body">Body</Label>
            <Textarea
              id="ann-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={4}
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="ann-media">Image (optional)</Label>
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
          </div>
          <AnnouncementPreview title={title} body={body} mediaUrl={mediaUrl || undefined} />
        </CardContent>
      </Card>

      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>Schedule &amp; targeting</CardTitle>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="ann-start">Starts</Label>
                <Input
                  id="ann-start"
                  type="datetime-local"
                  value={startAt}
                  onChange={(e) => setStartAt(e.target.value)}
                  required
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="ann-end">Ends</Label>
                <Input
                  id="ann-end"
                  type="datetime-local"
                  value={endAt}
                  onChange={(e) => setEndAt(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="ann-repeat">Repeat policy</Label>
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
            </div>
            {repeatPolicy === "MAX_N_TIMES" && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="ann-max-count">Display up to</Label>
                <Input
                  id="ann-max-count"
                  type="number"
                  min="1"
                  value={maxDisplayCount}
                  onChange={(e) => setMaxDisplayCount(e.target.value)}
                  required
                />
              </div>
            )}
            <LocationTargetPicker
              locations={locations ?? []}
              value={locationIds}
              onChange={setLocationIds}
            />
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
