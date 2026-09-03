import { NATIVE_MESSAGING_HOST_NAME, type NativeHostMessage } from '@saverlly/shared-types';
import { setApiBaseUrl } from './config';
import { setDeviceToken } from './storage';

/**
 * Connects to the desktop agent's native messaging host and applies whatever token +
 * API base URL it sends back. A push, not a request/response. The agent writes its one
 * message as soon as Chrome connects the port (see apps/agent's native-host-mode.ts). If
 * the native host isn't registered (agent not installed/running yet), connectNative still
 * returns a Port synchronously. The failure only surfaces via chrome.runtime.lastError on
 * immediate disconnect, which we treat as "no agent available yet," not an error to throw.
 * apiBaseUrl matters as much as the token here: without it, a real packaged extension has
 * no way to learn its backend origin and silently falls back to config.ts's localhost
 * default, which only ever works by coincidence in local dev.
 */
export function connectToAgentAndReceiveToken(
  connect: typeof chrome.runtime.connectNative = chrome.runtime.connectNative.bind(chrome.runtime),
): void {
  const port = connect(NATIVE_MESSAGING_HOST_NAME);

  port.onMessage.addListener((message: NativeHostMessage) => {
    if (message.type === 'device-token') {
      void setDeviceToken(message.token);
      void setApiBaseUrl(message.apiBaseUrl);
    }
    // 'error' (not yet registered on the agent side). Leave any existing stored token/URL as-is;
    // the regular status-check poll is what decides dormancy, not this handoff channel.
  });

  // No-op: a disconnect just means no token arrived this cycle (agent not installed/running
  // yet, or it hasn't finished registering). The regular status-check poll governs dormancy,
  // not this channel, so there's nothing to react to here beyond not crashing.
  port.onDisconnect.addListener(() => {});
}
