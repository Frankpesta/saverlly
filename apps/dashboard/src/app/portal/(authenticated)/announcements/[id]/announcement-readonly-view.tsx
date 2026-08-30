import { AnnouncementPreview } from "../announcement-preview"
import type { Announcement } from "@/lib/api/types"

/** Read-only view of an announcement for viewers who can't edit it: a location manager
 * (never has PATCH/DELETE rights), or a kiosk owner looking at a platform-wide admin
 * broadcast (kioskId null — TenantScopeGuard denies mutating those for anyone but ADMIN).
 * Just the preview card — no editable fields, no schedule/targeting details. */
export function AnnouncementReadOnlyView({ announcement }: { announcement: Announcement }) {
  return (
    <AnnouncementPreview
      title={announcement.title}
      body={announcement.body}
      mediaUrl={announcement.mediaUrl ?? undefined}
    />
  )
}
