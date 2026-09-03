import { AnnouncementRepeatPolicy, type ActiveAnnouncement } from '@saverlly/shared-types';
import { fetchActiveAnnouncements } from './api-client';
import {
  recordAnnouncementShown,
  recordDisplayAttemptFailed,
  shouldShowAnnouncement,
} from './announcement-state';
import { pollAndDisplayAnnouncements } from './announcements';
import { showAnnouncementOverlay } from './overlay';

jest.mock('./api-client');
jest.mock('./announcement-state');
jest.mock('./overlay');

const mockFetchActiveAnnouncements = fetchActiveAnnouncements as jest.MockedFunction<typeof fetchActiveAnnouncements>;
const mockShouldShow = shouldShowAnnouncement as jest.MockedFunction<typeof shouldShowAnnouncement>;
const mockRecordShown = recordAnnouncementShown as jest.MockedFunction<typeof recordAnnouncementShown>;
const mockRecordFailed = recordDisplayAttemptFailed as jest.MockedFunction<typeof recordDisplayAttemptFailed>;
const mockShowOverlay = showAnnouncementOverlay as jest.MockedFunction<typeof showAnnouncementOverlay>;

function ann(id: string, overrides: Partial<ActiveAnnouncement> = {}): ActiveAnnouncement {
  return {
    id,
    title: `Title ${id}`,
    body: `Body ${id}`,
    repeatPolicy: AnnouncementRepeatPolicy.ONCE,
    ...overrides,
  };
}

describe('pollAndDisplayAnnouncements', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('displays and records only the announcements that shouldShowAnnouncement allows', async () => {
    mockFetchActiveAnnouncements.mockResolvedValue([ann('shown'), ann('skipped')]);
    mockShouldShow.mockImplementation((a) => a.id === 'shown');
    mockShowOverlay.mockResolvedValue({ shown: true, renderer: 'webview2' });

    await pollAndDisplayAnnouncements('tok');

    expect(mockShowOverlay).toHaveBeenCalledTimes(1);
    expect(mockShowOverlay).toHaveBeenCalledWith(expect.objectContaining({ id: 'shown' }));
    expect(mockRecordShown).toHaveBeenCalledTimes(1);
    expect(mockRecordShown).toHaveBeenCalledWith(expect.objectContaining({ id: 'shown' }));
  });

  // The whole announcement is handed to the overlay now, not a flattened title/body/mediaUrl
  // triple. The overlay needs `layout` to render the kiosk owner's actual design.
  it("passes the announcement's media and layout through to the overlay", async () => {
    const layout = { version: 1, background: '#ffffff', elements: [] };
    mockFetchActiveAnnouncements.mockResolvedValue([
      ann('a', { mediaUrl: 'https://example.com/pic.png', layout }),
    ]);
    mockShouldShow.mockReturnValue(true);
    mockShowOverlay.mockResolvedValue({ shown: true, renderer: 'webview2' });

    await pollAndDisplayAnnouncements('tok');

    expect(mockShowOverlay).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Title a',
        body: 'Body a',
        mediaUrl: 'https://example.com/pic.png',
        layout,
      }),
    );
  });

  // The core accounting rule: dispatching an overlay is not the same as it appearing, so only a
  // confirmed render may be recorded.
  it.each([
    ['no-interactive-user', false],
    ['already-showing', false],
    ['render-failed', true],
    ['render-timeout', true],
    ['dispatch-failed', true],
  ] as const)(
    'does not record as shown on %s (counts against the retry budget: %s)',
    async (reason, countsAsFailure) => {
      mockFetchActiveAnnouncements.mockResolvedValue([ann('a')]);
      mockShouldShow.mockReturnValue(true);
      mockShowOverlay.mockResolvedValue({ shown: false, reason });

      await pollAndDisplayAnnouncements('tok');

      expect(mockShowOverlay).toHaveBeenCalledTimes(1);
      expect(mockRecordShown).not.toHaveBeenCalled();
      if (countsAsFailure) {
        expect(mockRecordFailed).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }));
      } else {
        // Nobody logged in / an overlay already up are transient conditions that resolve on
        // their own. Burning retries on them would strand announcements on an idle kiosk.
        expect(mockRecordFailed).not.toHaveBeenCalled();
      }
    },
  );

  it('keeps showing the rest when one announcement throws', async () => {
    mockFetchActiveAnnouncements.mockResolvedValue([ann('boom'), ann('ok')]);
    mockShouldShow.mockReturnValue(true);
    mockShowOverlay.mockImplementation(async (a) => {
      if (a.id === 'boom') throw new Error('unexpected');
      return { shown: true, renderer: 'legacy' };
    });

    await pollAndDisplayAnnouncements('tok');

    expect(mockRecordFailed).toHaveBeenCalledWith(expect.objectContaining({ id: 'boom' }));
    expect(mockRecordShown).toHaveBeenCalledTimes(1);
    expect(mockRecordShown).toHaveBeenCalledWith(expect.objectContaining({ id: 'ok' }));
  });

  it('does nothing when there are no active announcements', async () => {
    mockFetchActiveAnnouncements.mockResolvedValue([]);

    await pollAndDisplayAnnouncements('tok');

    expect(mockShowOverlay).not.toHaveBeenCalled();
    expect(mockRecordShown).not.toHaveBeenCalled();
  });

  it('skips display and recording entirely when none pass shouldShowAnnouncement', async () => {
    mockFetchActiveAnnouncements.mockResolvedValue([ann('a'), ann('b')]);
    mockShouldShow.mockReturnValue(false);

    await pollAndDisplayAnnouncements('tok');

    expect(mockShowOverlay).not.toHaveBeenCalled();
    expect(mockRecordShown).not.toHaveBeenCalled();
  });
});
