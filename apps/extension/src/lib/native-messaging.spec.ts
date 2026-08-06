import { NATIVE_MESSAGING_HOST_NAME } from '@saverlly/shared-types';

jest.mock('./storage');

import { connectToAgentAndReceiveToken } from './native-messaging';
import { setDeviceToken } from './storage';

const mockSetDeviceToken = setDeviceToken as jest.MockedFunction<typeof setDeviceToken>;

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
  });

  it('connects to the shared native messaging host name', () => {
    const { port } = fakePort();
    const connect = jest.fn().mockReturnValue(port);

    connectToAgentAndReceiveToken(connect);

    expect(connect).toHaveBeenCalledWith(NATIVE_MESSAGING_HOST_NAME);
  });

  it('stores the token from a device-token message', () => {
    const { port, fireMessage } = fakePort();
    connectToAgentAndReceiveToken(jest.fn().mockReturnValue(port));

    fireMessage({ type: 'device-token', token: 'agent-issued-token' });

    expect(mockSetDeviceToken).toHaveBeenCalledWith('agent-issued-token');
  });

  it('does not touch stored token state on an error message from the agent', () => {
    const { port, fireMessage } = fakePort();
    connectToAgentAndReceiveToken(jest.fn().mockReturnValue(port));

    fireMessage({ type: 'error', message: 'Device not registered yet' });

    expect(mockSetDeviceToken).not.toHaveBeenCalled();
  });

  it('does not throw when the port disconnects (e.g. agent/native host not installed)', () => {
    const { port, fireDisconnect } = fakePort();
    connectToAgentAndReceiveToken(jest.fn().mockReturnValue(port));

    expect(() => fireDisconnect()).not.toThrow();
  });
});
