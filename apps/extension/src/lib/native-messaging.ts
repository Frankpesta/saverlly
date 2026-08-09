import { NATIVE_MESSAGING_HOST_NAME, type NativeHostMessage } from '@saverlly/shared-types';
import { setDeviceToken } from './storage';

/**
 * Connects to the desktop agent's native messaging host and applies whatever token it
 * sends back. A push, not a request/response — the agent writes its one message as soon
 * as Chrome connects the port (see apps/agent's native-host-mode.ts). If the native host
 * isn't registered (agent not installed/running yet), connectNative still returns a Port
 * synchronously — the failure only surfaces via chrome.runtime.lastError on immediate
 * disconnect, which we treat as "no agent available yet," not an error to throw.
 */
export function connectToAgentAndReceiveToken(
  connect: typeof chrome.runtime.connectNative = chrome.runtime.connectNative.bind(chrome.runtime),
): void {
  const port = connect(NATIVE_MESSAGING_HOST_NAME);

  port.onMessage.addListener((message: NativeHostMessage) => {
    if (message.type === 'device-token') {
      void setDeviceToken(message.token);
    }
    // 'error' (not yet registered on the agent side) — leave any existing stored token as-is;
    // the regular status-check poll is what decides dormancy, not this handoff channel.
  });

  // No-op: a disconnect just means no token arrived this cycle (agent not installed/running
  // yet, or it hasn't finished registering) — the regular status-check poll governs dormancy,
  // not this channel, so there's nothing to react to here beyond not crashing.
  port.onDisconnect.addListener(() => {});
}
