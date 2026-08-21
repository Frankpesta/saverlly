import { NATIVE_MESSAGING_HOST_NAME } from '@saverlly/shared-types';

jest.mock('./storage');
jest.mock('./config');

import { setApiBaseUrl } from './config';
import { connectToAgentAndReceiveToken } from './native-messaging';
import { setDeviceToken } from './storage';

const mockSetDeviceToken = setDeviceToken as jest.MockedFunction<typeof setDeviceToken>;
const mockSetApiBaseUrl = setApiBaseUrl as jest.MockedFunction<typeof setApiBaseUrl>;

function fakePort() {
  const messageListeners: Array<(msg: unknown) => void> = [];
  const disconnectListeners: Array<() => void> = [];
  return {
    port: {
      onMessage: { addListener: (fn: (msg: unknown) => void) => messageListeners.push(fn) },
      onDisconnect: { addListener: (fn: () => void) => disconnectListeners.push(fn) },
    } as unknown as chrome.runtime.Port,
    fireMessage: (msg: unknown) => messageListeners.forEach((fn) => fn(msg)),
    fireDisconnect: () => disconnectListeners.forEach((fn) => fn()),
  };
}

describe('connectToAgentAndReceiveToken', () => {
  beforeEach(() => {
    mockSetDeviceToken.mockReset();
    mockSetApiBaseUrl.mockReset();
  });

  it('connects to the shared native messaging host name', () => {
    const { port } = fakePort();
    const connect = jest.fn().mockReturnValue(port);

    connectToAgentAndReceiveToken(connect);

    expect(connect).toHaveBeenCalledWith(NATIVE_MESSAGING_HOST_NAME);
  });

  it('stores the token and API base URL from a device-token message', () => {
    const { port, fireMessage } = fakePort();
    connectToAgentAndReceiveToken(jest.fn().mockReturnValue(port));

    fireMessage({ type: 'device-token', token: 'agent-issued-token', apiBaseUrl: 'https://api.example.com' });

    expect(mockSetDeviceToken).toHaveBeenCalledWith('agent-issued-token');
    expect(mockSetApiBaseUrl).toHaveBeenCalledWith('https://api.example.com');
  });

  it('does not touch stored token/URL state on an error message from the agent', () => {
    const { port, fireMessage } = fakePort();
    connectToAgentAndReceiveToken(jest.fn().mockReturnValue(port));

    fireMessage({ type: 'error', message: 'Device not registered yet' });

    expect(mockSetDeviceToken).not.toHaveBeenCalled();
    expect(mockSetApiBaseUrl).not.toHaveBeenCalled();
  });

  it('does not throw when the port disconnects (e.g. agent/native host not installed)', () => {
    const { port, fireDisconnect } = fakePort();
    connectToAgentAndReceiveToken(jest.fn().mockReturnValue(port));

    expect(() => fireDisconnect()).not.toThrow();
  });
});
