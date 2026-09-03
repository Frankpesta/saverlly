"use client"

import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { toast } from "sonner"
import { ArrowLeftIcon } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { DeleteRowButton } from "@/components/dashboard/delete-row-button"
import {
  useAnnouncement,
  useDeleteAnnouncement,
  useUpdateAnnouncement,
} from "@/lib/api/hooks/use-announcements"
import { useCurrentUser } from "@/lib/api/hooks/use-current-user"
import { ApiError } from "@/lib/api/client"
import { toDatetimeLocal } from "@/lib/format-date"
import { createDefaultLayout } from "@saverlly/shared-types"
import {
  AnnouncementForm,
  toAnnouncementPayload,
  type AnnouncementFormValues,
} from "../announcement-form"
import { AnnouncementReadOnlyView } from "./announcement-readonly-view"

export default function AnnouncementDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { data: announcement, isLoading: announcementLoading, isError } = useAnnouncement(id)
  const { data: currentUser, isLoading: userLoading } = useCurrentUser()
  const updateAnnouncement = useUpdateAnnouncement(id)
  const deleteAnnouncement = useDeleteAnnouncement()
  const isLoading = announcementLoading || userLoading

  // A location manager never has edit rights on announcements, and a kiosk owner can't edit a
  // platform-wide admin broadcast (kioskId null). TenantScopeGuard denies mutating those for
  // anyone but ADMIN, even though everyone in scope can view/preview them.
  const canEdit = currentUser?.role !== "LOCATION_MANAGER" && announcement?.kioskId !== null

  function handleSubmit(values: AnnouncementFormValues) {
    updateAnnouncement.mutate(toAnnouncementPayload(values), {
      onSuccess: () => toast.success("Announcement updated."),
      onError: (error) =>
        toast.error(error instanceof ApiError ? error.message : "Could not update announcement."),
    })
  }

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

  if (isError) {
    return <p className="text-sm text-destructive">Could not load this announcement.</p>
  }

  if (isLoading || !announcement) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-9 w-64" />
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
          <Skeleton className="h-96 w-full" />
          <Skeleton className="h-72 w-full" />
        </div>
      </div>
    )
  }

  // Viewers without edit rights get the header on its own, since the form (which normally
  // carries it) isn't rendered for them.
  if (!canEdit) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-1">
          <Link
            href="/portal/announcements"
            className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeftIcon className="size-3.5" />
            Announcements
          </Link>
          <h2 className="text-title">{announcement.title}</h2>
          <p className="text-sm text-muted-foreground">
            {announcement.kioskId === null
              ? "A platform-wide broadcast. Only Saverlly staff can change it."
              : "Your role can view announcements but not change them."}
          </p>
        </div>
        <div className="max-w-md">
          <AnnouncementReadOnlyView announcement={announcement} />
        </div>
      </div>
    )
  }

  return (
    <AnnouncementForm
      // Remounts when a different announcement loads. React-hook-form only reads defaultValues
      // on mount, so without this the form would keep showing the previously-viewed one.
      key={announcement.id}
      defaultValues={{
        title: announcement.title,
        body: announcement.body,
        mediaUrl: announcement.mediaUrl ?? "",
        startAt: toDatetimeLocal(announcement.startAt),
        endAt: toDatetimeLocal(announcement.endAt),
        repeatPolicy: announcement.repeatPolicy,
        maxDisplayCount: String(announcement.maxDisplayCount ?? 3),
        locationIds: announcement.locationIds,
        // Announcements created before the canvas editor have no stored layout; opening one in
        // the editor materialises the equivalent default design rather than showing a blank
        // canvas, so an old announcement can be edited without being rebuilt from scratch.
        layout:
          announcement.layout ??
          createDefaultLayout({
            title: announcement.title,
            body: announcement.body,
            mediaUrl: announcement.mediaUrl,
          }),
      }}
      heading={announcement.title}
      description="Shown on the kiosk screen when someone signs in at a targeted location."
      submitLabel="Save changes"
      pendingLabel="Saving…"
      onSubmit={handleSubmit}
      isPending={updateAnnouncement.isPending}
      headerActions={
        <DeleteRowButton
          itemLabel={announcement.title}
          description="This stops the announcement showing on kiosk screens immediately."
          onConfirm={handleDelete}
          isPending={deleteAnnouncement.isPending}
          ariaLabel={`Delete ${announcement.title}`}
          variant="button"
        />
      }
    />
  )
}
