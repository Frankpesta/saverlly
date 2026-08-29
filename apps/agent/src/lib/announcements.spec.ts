import { AnnouncementRepeatPolicy, type ActiveAnnouncement } from '@saverlly/shared-types';
import { fetchActiveAnnouncements } from './api-client';
import { recordAnnouncementShown, shouldShowAnnouncement } from './announcement-state';
import { pollAndDisplayAnnouncements } from './announcements';
import { showAnnouncementOverlay } from './overlay';

jest.mock('./api-client');
jest.mock('./announcement-state');
jest.mock('./overlay');

const mockFetchActiveAnnouncements = fetchActiveAnnouncements as jest.MockedFunction<typeof fetchActiveAnnouncements>;
const mockShouldShow = shouldShowAnnouncement as jest.MockedFunction<typeof shouldShowAnnouncement>;
const mockRecordShown = recordAnnouncementShown as jest.MockedFunction<typeof recordAnnouncementShown>;
const mockShowOverlay = showAnnouncementOverlay as jest.MockedFunction<typeof showAnnouncementOverlay>;

function ann(id: string): ActiveAnnouncement {
  return { id, title: `Title ${id}`, body: `Body ${id}`, repeatPolicy: AnnouncementRepeatPolicy.ONCE };
}

describe('pollAndDisplayAnnouncements', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('displays and records only the announcements that shouldShowAnnouncement allows', async () => {
    mockFetchActiveAnnouncements.mockResolvedValue([ann('shown'), ann('skipped')]);
    mockShouldShow.mockImplementation((a) => a.id === 'shown');
    mockShowOverlay.mockReturnValue(true);

    await pollAndDisplayAnnouncements('tok');

    expect(mockShowOverlay).toHaveBeenCalledTimes(1);
    expect(mockShowOverlay).toHaveBeenCalledWith('Title shown', 'Body shown');
    expect(mockRecordShown).toHaveBeenCalledTimes(1);
    expect(mockRecordShown).toHaveBeenCalledWith(expect.objectContaining({ id: 'shown' }));
  });

  it('does not record as shown when nobody is logged in to see the popup', async () => {
    mockFetchActiveAnnouncements.mockResolvedValue([ann('a')]);
    mockShouldShow.mockReturnValue(true);
    mockShowOverlay.mockReturnValue(false);

    await pollAndDisplayAnnouncements('tok');

    expect(mockShowOverlay).toHaveBeenCalledTimes(1);
    expect(mockRecordShown).not.toHaveBeenCalled();
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
