import { AnnouncementRepeatPolicy } from './enums';
import { AnnouncementLayout } from './announcement-layout';

export interface ActiveAnnouncement {
  id: string;
  title: string;
  /** The dashboard-side internal note, not kiosk copy. Optional, and only ever read by
   *  `createDefaultLayout` when an announcement predates the canvas editor and has no layout. */
  body?: string | null;
  mediaUrl?: string | null;
  repeatPolicy: AnnouncementRepeatPolicy;
  maxDisplayCount?: number | null;
  /** The freeform canvas design. Null for announcements created before the canvas editor (and
   *  for any whose stored layout failed validation). The agent falls back to `createDefaultLayout`
   *  from title/body/mediaUrl in that case, so every announcement still renders. */
  layout?: AnnouncementLayout | null;
}
