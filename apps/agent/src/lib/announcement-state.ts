import type { ActiveAnnouncement } from '@saverlly/shared-types';
import * as fs from 'fs';
import * as path from 'path';
import { announcementStateFilePath } from './paths';

interface PersistedDisplayState {
  [announcementId: string]: { shownCount: number };
}

// EVERY_LOGIN resets naturally each agent run (one run == one login session, per the
// spec's chosen "background app launched at every Windows login" architecture) — an
// in-memory Set is all that's needed, no disk persistence.
const defaultSessionShownIds = new Set<string>();

export interface AnnouncementStateOptions {
  /** Defaults to %PROGRAMDATA%/KioskAgent/announcement-state.json — override only for isolated testing. */
  filePath?: string;
  /** Defaults to a module-level singleton — override only for isolated testing. */
  sessionShownIds?: Set<string>;
}

function readState(filePath: string): PersistedDisplayState {
  if (!fs.existsSync(filePath)) {
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return typeof parsed === 'object' && parsed !== null ? (parsed as PersistedDisplayState) : {};
  } catch {
    return {};
  }
}

function writeState(filePath: string, state: PersistedDisplayState): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2), 'utf8');
}

type AnnouncementForDisplay = Pick<ActiveAnnouncement, 'id' | 'repeatPolicy' | 'maxDisplayCount'>;

export function shouldShowAnnouncement(
  announcement: AnnouncementForDisplay,
  options: AnnouncementStateOptions = {},
): boolean {
  const sessionShownIds = options.sessionShownIds ?? defaultSessionShownIds;

  if (announcement.repeatPolicy === 'EVERY_LOGIN') {
    return !sessionShownIds.has(announcement.id);
  }

  const filePath = options.filePath ?? announcementStateFilePath();
  const shownCount = readState(filePath)[announcement.id]?.shownCount ?? 0;

  if (announcement.repeatPolicy === 'ONCE') {
    return shownCount < 1;
  }
  if (announcement.repeatPolicy === 'MAX_N_TIMES') {
    return shownCount < (announcement.maxDisplayCount ?? 0);
  }
  return false;
}

export function recordAnnouncementShown(
  announcement: AnnouncementForDisplay,
  options: AnnouncementStateOptions = {},
): void {
  const sessionShownIds = options.sessionShownIds ?? defaultSessionShownIds;

  if (announcement.repeatPolicy === 'EVERY_LOGIN') {
    sessionShownIds.add(announcement.id);
    return;
  }

  const filePath = options.filePath ?? announcementStateFilePath();
  const state = readState(filePath);
  const shownCount = state[announcement.id]?.shownCount ?? 0;
  state[announcement.id] = { shownCount: shownCount + 1 };
  writeState(filePath, state);
}
