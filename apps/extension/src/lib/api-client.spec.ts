import { AuthError, fetchDeviceStatus } from './api-client';

jest.mock('./storage');
jest.mock('./config');

import { getApiBaseUrl } from './config';
import { getDeviceToken, setDormant } from './storage';

const mockGetApiBaseUrl = getApiBaseUrl as jest.MockedFunction<typeof getApiBaseUrl>;
const mockGetDeviceToken = getDeviceToken as jest.MockedFunction<typeof getDeviceToken>;
const mockSetDormant = setDormant as jest.MockedFunction<typeof setDormant>;

describe('apiFetch (via fetchDeviceStatus)', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockGetApiBaseUrl.mockResolvedValue('http://localhost:3000');
  });

  it('persists dormant state and throws when no device token is present', async () => {
    mockGetDeviceToken.mockResolvedValue(null);

    await expect(fetchDeviceStatus()).rejects.toThrow(AuthError);
    expect(mockSetDormant).toHaveBeenCalledWith(true);
  });
});
