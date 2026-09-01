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
    // Only record as shown if a popup actually got dispatched to a real logged-in session —
    // showAnnouncementOverlay returns false when nobody's logged in (lock/login screen), and a
    // ONCE/MAX_N_TIMES announcement shouldn't burn its one showing on nobody.
    const shown = showAnnouncementOverlay(announcement);
    if (shown) {
      recordAnnouncementShown(announcement);
    }
  }
}
