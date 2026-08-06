import { AnnouncementRepeatPolicy } from './enums';

export interface ActiveAnnouncement {
  id: string;
  title: string;
  body: string;
  mediaUrl?: string | null;
  repeatPolicy: AnnouncementRepeatPolicy;
  maxDisplayCount?: number | null;
}
