"use client"

import * as React from "react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { AnnouncementPreview } from "../announcement-preview"
import { ANNOUNCEMENT_STATUS_BADGE_VARIANT, type AnnouncementStatus } from "@/lib/dashboard/status-labels"
import type { Announcement, AnnouncementRepeatPolicy, Location } from "@/lib/api/types"

const REPEAT_LABEL: Record<AnnouncementRepeatPolicy, string> = {
  ONCE: "Once",
  EVERY_LOGIN: "Every login",
  MAX_N_TIMES: "A set number of times",
}

const DATETIME_FORMAT = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
})

function statusFor(announcement: Announcement, now: number): AnnouncementStatus {
  const start = new Date(announcement.startAt).getTime()
  const end = new Date(announcement.endAt).getTime()
  if (now < start) return "Scheduled"
  if (now > end) return "Expired"
  return "Active"
}

/** Read-only view of an announcement for viewers who can't edit it: a location manager
 * (never has PATCH/DELETE rights), or a kiosk owner looking at a platform-wide admin
 * broadcast (kioskId null — TenantScopeGuard denies mutating those for anyone but ADMIN). */
export function AnnouncementReadOnlyView({
  announcement,
  locations,
  reason,
}: {
  announcement: Announcement
  locations: Location[]
  reason: "broadcast" | "location-manager"
}) {
  const [now, setNow] = React.useState(() => Date.now())
  React.useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(interval)
  }, [])
  const status = statusFor(announcement, now)
  const locationNames =
    announcement.locationIds.length === 0
      ? "All locations"
      : announcement.locationIds
          .map((id) => locations.find((l) => l.id === id)?.name ?? "Unknown location")
          .join(", ")

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Content</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            {reason === "broadcast"
              ? "This is a platform-wide announcement from Saverlly — it can't be edited here."
              : "Location managers can preview announcements but can't edit them."}
          </p>
          <AnnouncementPreview
            title={announcement.title}
            body={announcement.body}
            mediaUrl={announcement.mediaUrl ?? undefined}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Schedule &amp; targeting</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Status</span>
            <Badge variant={ANNOUNCEMENT_STATUS_BADGE_VARIANT[status]}>{status}</Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Starts</span>
            <span>{DATETIME_FORMAT.format(new Date(announcement.startAt))}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Ends</span>
            <span>{DATETIME_FORMAT.format(new Date(announcement.endAt))}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Repeat</span>
            <span>{REPEAT_LABEL[announcement.repeatPolicy]}</span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="shrink-0 text-muted-foreground">Locations</span>
            <span className="text-right">{locationNames}</span>
          </div>
        </CardContent>
      </Card>
    </>
  )
}
