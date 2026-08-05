import { AuthError } from './api-client';
import { isWithinGracePeriod, checkDeviceStatus } from './status-check';

jest.mock('./api-client');
jest.mock('./storage');

import { fetchDeviceStatus } from './api-client';
import { getLastStatusOkAt, isDormant, setDormant, setLastStatusOkAt } from './storage';

const mockFetchDeviceStatus = fetchDeviceStatus as jest.MockedFunction<typeof fetchDeviceStatus>;
const mockGetLastStatusOkAt = getLastStatusOkAt as jest.MockedFunction<typeof getLastStatusOkAt>;
const mockIsDormant = isDormant as jest.MockedFunction<typeof isDormant>;
const mockSetDormant = setDormant as jest.MockedFunction<typeof setDormant>;
const mockSetLastStatusOkAt = setLastStatusOkAt as jest.MockedFunction<typeof setLastStatusOkAt>;

describe('isWithinGracePeriod', () => {
  const now = 1_000_000_000_000;

  it('is false with no prior known-good timestamp', () => {
    expect(isWithinGracePeriod(null, now)).toBe(false);
  });

  it('is true within the 1-hour grace window', () => {
    expect(isWithinGracePeriod(now - 30 * 60 * 1000, now)).toBe(true);
  });

  it('is false once the grace window has elapsed', () => {
    expect(isWithinGracePeriod(now - 61 * 60 * 1000, now)).toBe(false);
  });
});

describe('checkDeviceStatus', () => {
  const now = 1_000_000_000_000;

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('marks active and records the timestamp when kiosk and device are both active', async () => {
    mockFetchDeviceStatus.mockResolvedValue({ kioskStatus: 'ACTIVE' as never, deviceActive: true });

    const result = await checkDeviceStatus(now);

    expect(result).toBe(true);
    expect(mockSetDormant).toHaveBeenCalledWith(false);
    expect(mockSetLastStatusOkAt).toHaveBeenCalledWith(now);
  });

  it('goes dormant immediately on an explicit inactive response, no grace period', async () => {
    mockFetchDeviceStatus.mockResolvedValue({ kioskStatus: 'INACTIVE' as never, deviceActive: true });

    const result = await checkDeviceStatus(now);

    expect(result).toBe(false);
    expect(mockSetDormant).toHaveBeenCalledWith(true);
    expect(mockSetLastStatusOkAt).not.toHaveBeenCalled();
  });

  it('goes dormant immediately on a 401/403 auth error, no grace period', async () => {
    mockFetchDeviceStatus.mockRejectedValue(new AuthError(401));

    const result = await checkDeviceStatus(now);

    expect(result).toBe(false);
  });

  it('stays active on a network failure within the grace window', async () => {
    mockFetchDeviceStatus.mockRejectedValue(new Error('network down'));
    mockGetLastStatusOkAt.mockResolvedValue(now - 10 * 60 * 1000);
    mockIsDormant.mockResolvedValue(false);

    const result = await checkDeviceStatus(now);

    expect(result).toBe(true);
    expect(mockSetDormant).not.toHaveBeenCalled();
  });

  it('force-disables on a network failure once the grace window has elapsed', async () => {
    mockFetchDeviceStatus.mockRejectedValue(new Error('network down'));
    mockGetLastStatusOkAt.mockResolvedValue(now - 2 * 60 * 60 * 1000);

    const result = await checkDeviceStatus(now);

    expect(result).toBe(false);
    expect(mockSetDormant).toHaveBeenCalledWith(true);
  });
});
