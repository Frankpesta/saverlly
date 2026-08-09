import { fetchActiveAnnouncements } from './api-client';
import { recordAnnouncementShown, shouldShowAnnouncement } from './announcement-state';
import { showAnnouncementOverlay } from './overlay';

/** Fetches this device's currently-active announcements and displays any not yet shown per their repeat policy. */
export async function pollAndDisplayAnnouncements(token: string): Promise<void> {
  const announcements = await fetchActiveAnnouncements(token);
  for (const announcement of announcements) {
    if (!shouldShowAnnouncement(announcement)) {
      continue;
    }
    showAnnouncementOverlay(announcement.title, announcement.body);
    recordAnnouncementShown(announcement);
  }
}
