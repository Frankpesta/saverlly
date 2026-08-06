import { registerDevice } from './api-client';
import { getOrCreateDeviceIdentifier } from './identity';
import { ensureRegistered } from './registration';
import { loadDeviceToken, saveDeviceToken } from './token-storage';

jest.mock('./api-client');
jest.mock('./identity');
jest.mock('./token-storage');

const mockRegisterDevice = registerDevice as jest.MockedFunction<typeof registerDevice>;
const mockGetOrCreateDeviceIdentifier = getOrCreateDeviceIdentifier as jest.MockedFunction<
  typeof getOrCreateDeviceIdentifier
>;
const mockLoadDeviceToken = loadDeviceToken as jest.MockedFunction<typeof loadDeviceToken>;
const mockSaveDeviceToken = saveDeviceToken as jest.MockedFunction<typeof saveDeviceToken>;

describe('ensureRegistered', () => {
  const originalEnv = process.env.SAVERLLY_SETUP_CODE;

  afterEach(() => {
    jest.resetAllMocks();
    if (originalEnv === undefined) {
      delete process.env.SAVERLLY_SETUP_CODE;
    } else {
      process.env.SAVERLLY_SETUP_CODE = originalEnv;
    }
  });

  it('returns the existing token without calling registerDevice, when already registered', async () => {
    mockLoadDeviceToken.mockReturnValue('already-have-a-token');

    const token = await ensureRegistered();

    expect(token).toBe('already-have-a-token');
    expect(mockRegisterDevice).not.toHaveBeenCalled();
  });

  it('registers with the backend and persists the token, when no token is stored yet', async () => {
    mockLoadDeviceToken.mockReturnValue(null);
    mockGetOrCreateDeviceIdentifier.mockReturnValue('local-uuid-abc');
    process.env.SAVERLLY_SETUP_CODE = 'SETUP123';
    mockRegisterDevice.mockResolvedValue({ deviceId: 'dev-1', label: 'PC-1', token: 'fresh-token' });

    const token = await ensureRegistered();

    expect(token).toBe('fresh-token');
    expect(mockRegisterDevice).toHaveBeenCalledWith(
      expect.objectContaining({ setupCode: 'SETUP123', deviceIdentifier: 'local-uuid-abc' }),
    );
    expect(mockSaveDeviceToken).toHaveBeenCalledWith('fresh-token');
  });

  it('throws without calling registerDevice when no setup code is available', async () => {
    mockLoadDeviceToken.mockReturnValue(null);
    mockGetOrCreateDeviceIdentifier.mockReturnValue('local-uuid-abc');
    process.env.SAVERLLY_SETUP_CODE = '   '; // blank after trim

    await expect(ensureRegistered()).rejects.toThrow('No setup code provided');
    expect(mockRegisterDevice).not.toHaveBeenCalled();
  });
});
