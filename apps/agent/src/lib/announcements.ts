import { fetchActiveAnnouncements } from './api-client';
import {
  recordAnnouncementShown,
  recordDisplayAttemptFailed,
  shouldShowAnnouncement,
} from './announcement-state';
import { showAnnouncementOverlay } from './overlay';

/**
 * Reasons an overlay didn't appear that say nothing about the announcement itself — nobody is
 * logged in yet, or the kiosk user hasn't dismissed the previous one. Both resolve on their own,
 * so they must not consume the retry budget; a kiosk parked at the login screen would otherwise
 * exhaust every announcement's attempts before anyone sat down at it.
 */
const TRANSIENT_REASONS = new Set(['no-interactive-user', 'already-showing']);

/** Fetches this device's currently-active announcements and displays any not yet shown per their repeat policy. */
export async function pollAndDisplayAnnouncements(token: string): Promise<void> {
  const announcements = await fetchActiveAnnouncements(token);
  for (const announcement of announcements) {
    if (!shouldShowAnnouncement(announcement)) {
      continue;
    }

    // One announcement failing must not strand the ones behind it — showAnnouncementOverlay
    // already resolves its own failures, so this only catches genuinely unexpected throws.
    try {
      const result = await showAnnouncementOverlay(announcement);

      if (result.shown) {
        // Only now: the overlay reported that it actually rendered on the kiosk's screen.
        recordAnnouncementShown(announcement);
        continue;
      }

      if (!TRANSIENT_REASONS.has(result.reason)) {
        console.warn(
          `[saverlly-agent] announcement ${announcement.id} did not render (${result.reason})` +
            (result.detail ? `: ${result.detail}` : ''),
        );
        recordDisplayAttemptFailed(announcement);
      }
    } catch (err) {
      console.error(`[saverlly-agent] announcement ${announcement.id} failed to display`, err);
      recordDisplayAttemptFailed(announcement);
    }
  }
}
