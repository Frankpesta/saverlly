import { AnnouncementRepeatPolicy, type ActiveAnnouncement } from '@saverlly/shared-types';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  MAX_DISPLAY_ATTEMPTS,
  hasExhaustedDisplayAttempts,
  recordAnnouncementShown,
  recordDisplayAttemptFailed,
  shouldShowAnnouncement,
} from './announcement-state';

function announcement(overrides: Partial<ActiveAnnouncement> = {}): Pick<
  ActiveAnnouncement,
  'id' | 'repeatPolicy' | 'maxDisplayCount'
> {
  return {
    id: overrides.id ?? 'ann-1',
    repeatPolicy: overrides.repeatPolicy ?? AnnouncementRepeatPolicy.ONCE,
    maxDisplayCount: overrides.maxDisplayCount,
  };
}

describe('announcement-state', () => {
  let tmpDir: string;
  let filePath: string;
  let sessionShownIds: Set<string>;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'saverlly-agent-announcements-'));
    filePath = path.join(tmpDir, 'nested', 'announcement-state.json');
    sessionShownIds = new Set();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('ONCE', () => {
    it('shows an announcement that has never been shown', () => {
      expect(shouldShowAnnouncement(announcement({ repeatPolicy: AnnouncementRepeatPolicy.ONCE }), { filePath })).toBe(true);
    });

    it('never shows it again after one recordAnnouncementShown call', () => {
      const ann = announcement({ repeatPolicy: AnnouncementRepeatPolicy.ONCE });
      recordAnnouncementShown(ann, { filePath });
      expect(shouldShowAnnouncement(ann, { filePath })).toBe(false);
    });

    it('persists across separate calls (simulating separate agent runs) via the file', () => {
      const ann = announcement({ repeatPolicy: AnnouncementRepeatPolicy.ONCE, id: 'persisted-1' });
      recordAnnouncementShown(ann, { filePath });
      // A fresh call with the same filePath but no shared in-memory state must still see it as shown.
      expect(shouldShowAnnouncement(ann, { filePath })).toBe(false);
    });
  });

  describe('MAX_N_TIMES', () => {
    it('shows up to maxDisplayCount times, then stops', () => {
      const ann = announcement({ repeatPolicy: AnnouncementRepeatPolicy.MAX_N_TIMES, maxDisplayCount: 2 });

      expect(shouldShowAnnouncement(ann, { filePath })).toBe(true);
      recordAnnouncementShown(ann, { filePath });

      expect(shouldShowAnnouncement(ann, { filePath })).toBe(true);
      recordAnnouncementShown(ann, { filePath });

      expect(shouldShowAnnouncement(ann, { filePath })).toBe(false);
    });

    it('treats a missing maxDisplayCount as 0 (never shows)', () => {
      const ann = announcement({ repeatPolicy: AnnouncementRepeatPolicy.MAX_N_TIMES, maxDisplayCount: undefined });
      expect(shouldShowAnnouncement(ann, { filePath })).toBe(false);
    });
  });

  describe('EVERY_LOGIN', () => {
    it('shows once per session (in-memory), independent of the persisted file', () => {
      const ann = announcement({ repeatPolicy: AnnouncementRepeatPolicy.EVERY_LOGIN });

      expect(shouldShowAnnouncement(ann, { filePath, sessionShownIds })).toBe(true);
      recordAnnouncementShown(ann, { filePath, sessionShownIds });
      expect(shouldShowAnnouncement(ann, { filePath, sessionShownIds })).toBe(false);

      // A fresh session Set (simulating the next login/agent run) sees it as unshown again.
      expect(shouldShowAnnouncement(ann, { filePath, sessionShownIds: new Set() })).toBe(true);
    });

    it('never writes to the persisted state file', () => {
      const ann = announcement({ repeatPolicy: AnnouncementRepeatPolicy.EVERY_LOGIN });
      recordAnnouncementShown(ann, { filePath, sessionShownIds });
      expect(fs.existsSync(filePath)).toBe(false);
    });
  });

  it('tracks multiple announcements independently in the same state file', () => {
    const annA = announcement({ id: 'a', repeatPolicy: AnnouncementRepeatPolicy.ONCE });
    const annB = announcement({ id: 'b', repeatPolicy: AnnouncementRepeatPolicy.ONCE });

    recordAnnouncementShown(annA, { filePath });

    expect(shouldShowAnnouncement(annA, { filePath })).toBe(false);
    expect(shouldShowAnnouncement(annB, { filePath })).toBe(true);
  });

  it('treats a corrupt state file as empty rather than throwing', () => {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, '{ not valid json', 'utf8');

    expect(shouldShowAnnouncement(announcement({ repeatPolicy: AnnouncementRepeatPolicy.ONCE }), { filePath })).toBe(true);
  });

  // Without a budget, "only record it as shown once it's confirmed rendered" turns any
  // persistent rendering fault into an announcement re-dispatched every 60s forever.
  describe('display attempt budget', () => {
    it('stops offering an announcement after MAX_DISPLAY_ATTEMPTS failures', () => {
      const failedAttempts = new Map<string, number>();
      const ann = announcement({ repeatPolicy: AnnouncementRepeatPolicy.ONCE });

      for (let i = 0; i < MAX_DISPLAY_ATTEMPTS - 1; i += 1) {
        recordDisplayAttemptFailed(ann, { failedAttempts });
        expect(hasExhaustedDisplayAttempts(ann, { failedAttempts })).toBe(false);
        expect(shouldShowAnnouncement(ann, { filePath, failedAttempts })).toBe(true);
      }

      recordDisplayAttemptFailed(ann, { failedAttempts });
      expect(hasExhaustedDisplayAttempts(ann, { failedAttempts })).toBe(true);
      expect(shouldShowAnnouncement(ann, { filePath, failedAttempts })).toBe(false);
    });

    it('applies to EVERY_LOGIN announcements too, which never consult the state file', () => {
      const failedAttempts = new Map<string, number>();
      const sessionShownIds = new Set<string>();
      const ann = announcement({ repeatPolicy: AnnouncementRepeatPolicy.EVERY_LOGIN });

      for (let i = 0; i < MAX_DISPLAY_ATTEMPTS; i += 1) {
        recordDisplayAttemptFailed(ann, { failedAttempts });
      }

      expect(shouldShowAnnouncement(ann, { sessionShownIds, failedAttempts })).toBe(false);
    });

    it('budgets each announcement separately', () => {
      const failedAttempts = new Map<string, number>();
      const failing = announcement({ id: 'failing', repeatPolicy: AnnouncementRepeatPolicy.ONCE });
      const healthy = announcement({ id: 'healthy', repeatPolicy: AnnouncementRepeatPolicy.ONCE });

      for (let i = 0; i < MAX_DISPLAY_ATTEMPTS; i += 1) {
        recordDisplayAttemptFailed(failing, { failedAttempts });
      }

      expect(shouldShowAnnouncement(failing, { filePath, failedAttempts })).toBe(false);
      expect(shouldShowAnnouncement(healthy, { filePath, failedAttempts })).toBe(true);
    });

    // Failures are in-memory only: a missing runtime gets fixed by an install or a reboot, and
    // the announcement should get a fresh chance afterwards rather than being written off on disk.
    it('does not persist failures to the state file', () => {
      const failedAttempts = new Map<string, number>();
      const ann = announcement({ repeatPolicy: AnnouncementRepeatPolicy.ONCE });

      recordDisplayAttemptFailed(ann, { failedAttempts });

      expect(fs.existsSync(filePath)).toBe(false);
      expect(shouldShowAnnouncement(ann, { filePath })).toBe(true);
    });
  });
});
