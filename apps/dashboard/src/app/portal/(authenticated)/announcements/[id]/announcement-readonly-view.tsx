import { createDefaultLayout } from "@saverlly/shared-types"
import { AnnouncementLayoutPreview } from "../announcement-layout-preview"
import type { Announcement } from "@/lib/api/types"

/** Read-only view of an announcement for viewers who can't edit it: a location manager
 * (never has PATCH/DELETE rights), or a kiosk owner looking at a platform-wide admin
 * broadcast (kioskId null — TenantScopeGuard denies mutating those for anyone but ADMIN).
 * Shows the real kiosk rendering — no editable fields, no schedule/targeting details.
 *
 * Falls back to a default layout for announcements authored before the canvas editor, which is
 * the same thing the kiosk agent does, so this view never disagrees with the actual screen. */
export function AnnouncementReadOnlyView({ announcement }: { announcement: Announcement }) {
  const layout =
    announcement.layout ??
    createDefaultLayout({
      title: announcement.title,
      body: announcement.body,
      mediaUrl: announcement.mediaUrl,
    })

  return <AnnouncementLayoutPreview layout={layout} label="Kiosk screen" />
}
