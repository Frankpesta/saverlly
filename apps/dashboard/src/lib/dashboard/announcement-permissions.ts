import type { Announcement, UserProfile } from "@/lib/api/types"

/**
 * Whether this person may edit or delete this announcement.
 *
 * Mirrors the backend: `TenantScopeGuard`'s ANNOUNCEMENT branch plus
 * `AnnouncementsService.assertIsAuthorIfManager`. Kept in one place because the list page and
 * the detail page both need it and would otherwise drift.
 *
 * A location manager may change what they wrote and nothing else. An announcement the owner (or
 * another manager) made for the same location is not theirs, and one written before authorship
 * was recorded has no author, so it stays owner-only.
 */
export function canManageAnnouncement(
  user: Pick<UserProfile, "id" | "role"> | undefined,
  announcement: Pick<Announcement, "kioskId" | "createdById">,
): boolean {
  if (!user) return false
  // A platform-wide broadcast belongs to Saverlly staff, whoever is looking at it.
  if (announcement.kioskId === null) return false
  if (user.role === "LOCATION_MANAGER") {
    return announcement.createdById === user.id
  }
  return user.role === "KIOSK_OWNER" || user.role === "ADMIN"
}
