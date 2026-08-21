import { isAgentActive } from './agent-status';
import { getApiBaseUrl } from './config';
import { decodeNativeMessage } from './native-messaging-protocol';
import { isNativeMessagingInvocation, respondWithDeviceToken } from './native-host-mode';
import { loadDeviceToken } from './token-storage';

jest.mock('./token-storage');
jest.mock('./agent-status');
jest.mock('./config');
const mockLoadDeviceToken = loadDeviceToken as jest.MockedFunction<typeof loadDeviceToken>;
const mockIsAgentActive = isAgentActive as jest.MockedFunction<typeof isAgentActive>;
const mockGetApiBaseUrl = getApiBaseUrl as jest.MockedFunction<typeof getApiBaseUrl>;

describe('isNativeMessagingInvocation', () => {
  it('detects the chrome-extension:// origin argv Chrome passes when launching the host', () => {
    expect(isNativeMessagingInvocation(['exe.exe', 'chrome-extension://abcdefghijklmnop/'])).toBe(true);
  });

  it('is false for a normal background-agent startup with no args', () => {
    expect(isNativeMessagingInvocation(['exe.exe'])).toBe(false);
  });

  it('is false for unrelated args', () => {
    expect(isNativeMessagingInvocation(['exe.exe', '--some-flag'])).toBe(false);
  });
});

describe('respondWithDeviceToken', () => {
  let writeSpy: jest.SpyInstance;

  beforeEach(() => {
    writeSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    writeSpy.mockRestore();
  });

  it('writes a framed device-token message (with the configured API base URL) when a token is stored and the device is active', () => {
    mockLoadDeviceToken.mockReturnValue('the-real-token');
    mockIsAgentActive.mockReturnValue(true);
    mockGetApiBaseUrl.mockReturnValue('https://api.example.com');

    respondWithDeviceToken();

    const written = writeSpy.mock.calls[0][0] as Buffer;
    expect(decodeNativeMessage(written)?.message).toEqual({
      type: 'device-token',
      token: 'the-real-token',
      apiBaseUrl: 'https://api.example.com',
    });
  });

  it('writes a framed error message when no token is stored yet', () => {
    mockLoadDeviceToken.mockReturnValue(null);
    mockIsAgentActive.mockReturnValue(true);

    respondWithDeviceToken();

    const written = writeSpy.mock.calls[0][0] as Buffer;
    const decoded = decodeNativeMessage(written)?.message as { type: string };
    expect(decoded.type).toBe('error');
  });

  it('writes a framed error message (not the token) when a token exists but the kill-switch/kiosk-inactive check failed', () => {
    mockLoadDeviceToken.mockReturnValue('the-real-token');
    mockIsAgentActive.mockReturnValue(false);

    respondWithDeviceToken();

    const written = writeSpy.mock.calls[0][0] as Buffer;
    const decoded = decodeNativeMessage(written)?.message as { type: string };
    expect(decoded.type).toBe('error');
  });
});
