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

/**
 * How many times a single announcement may fail to render before the agent stops trying it this
 * session.
 *
 * Without a budget, "only record it as shown once we've confirmed it rendered" turns any
 * persistent rendering problem into an infinite loop — the agent would re-dispatch the same
 * announcement every poll cycle, forever. Bounded retries keep the honest accounting (a failed
 * showing is never counted as shown) without that failure mode.
 */
export const MAX_DISPLAY_ATTEMPTS = 3;

/**
 * Failure counts are per agent run, not persisted, and deliberately so: a render failure is a
 * machine-level condition (missing runtime, locked user-data folder), so retrying afresh after a
 * reboot or re-login is exactly right once the underlying problem is fixed.
 */
const defaultFailedAttempts = new Map<string, number>();

export interface AnnouncementStateOptions {
  /** Defaults to %PROGRAMDATA%/KioskAgent/announcement-state.json — override only for isolated testing. */
  filePath?: string;
  /** Defaults to a module-level singleton — override only for isolated testing. */
  sessionShownIds?: Set<string>;
  /** Defaults to a module-level singleton — override only for isolated testing. */
  failedAttempts?: Map<string, number>;
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

/** Counts one failed attempt to put this announcement on screen. */
export function recordDisplayAttemptFailed(
  announcement: AnnouncementForDisplay,
  options: AnnouncementStateOptions = {},
): void {
  const failedAttempts = options.failedAttempts ?? defaultFailedAttempts;
  failedAttempts.set(announcement.id, (failedAttempts.get(announcement.id) ?? 0) + 1);
}

/** True once this announcement has burned its retry budget for this agent run. */
export function hasExhaustedDisplayAttempts(
  announcement: AnnouncementForDisplay,
  options: AnnouncementStateOptions = {},
): boolean {
  const failedAttempts = options.failedAttempts ?? defaultFailedAttempts;
  return (failedAttempts.get(announcement.id) ?? 0) >= MAX_DISPLAY_ATTEMPTS;
}

export function shouldShowAnnouncement(
  announcement: AnnouncementForDisplay,
  options: AnnouncementStateOptions = {},
): boolean {
  const sessionShownIds = options.sessionShownIds ?? defaultSessionShownIds;

  // Checked before the repeat policy: an announcement that can't be rendered on this machine
  // shouldn't be retried every 60 seconds for the rest of the session regardless of policy.
  if (hasExhaustedDisplayAttempts(announcement, options)) {
    return false;
  }

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
