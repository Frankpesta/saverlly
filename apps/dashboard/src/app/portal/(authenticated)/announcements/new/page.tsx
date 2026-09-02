"use client"

import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { useCreateAnnouncement } from "@/lib/api/hooks/use-announcements"
import { ApiError } from "@/lib/api/client"
import {
  AnnouncementForm,
  emptyAnnouncementForm,
  toAnnouncementPayload,
  type AnnouncementFormValues,
} from "../announcement-form"

export default function NewAnnouncementPage() {
  const router = useRouter()
  const createAnnouncement = useCreateAnnouncement()

  function handleSubmit(values: AnnouncementFormValues) {
    createAnnouncement.mutate(toAnnouncementPayload(values), {
      onSuccess: () => {
        toast.success(`${values.title} was created.`)
        router.push("/portal/announcements")
      },
      onError: (error) =>
        toast.error(error instanceof ApiError ? error.message : "Could not create announcement."),
    })
  }

  return (
    <AnnouncementForm
      defaultValues={emptyAnnouncementForm()}
      heading="New announcement"
      description="Shown on the kiosk screen when someone signs in at a targeted location."
      submitLabel="Create announcement"
      pendingLabel="Creating…"
      onSubmit={handleSubmit}
      isPending={createAnnouncement.isPending}
    />
  )
}
