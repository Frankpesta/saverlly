import { AnnouncementRepeatPolicy } from './enums';
import { AnnouncementLayout } from './announcement-layout';

export interface ActiveAnnouncement {
  id: string;
  title: string;
  body: string;
  mediaUrl?: string | null;
  repeatPolicy: AnnouncementRepeatPolicy;
  maxDisplayCount?: number | null;
  /** The freeform canvas design. Null for announcements created before the canvas editor (and
   *  for any whose stored layout failed validation) — the agent falls back to `createDefaultLayout`
   *  from title/body/mediaUrl in that case, so every announcement still renders. */
  layout?: AnnouncementLayout | null;
}
