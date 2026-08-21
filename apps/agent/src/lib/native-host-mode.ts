import type { NativeHostMessage } from '@saverlly/shared-types';
import { isAgentActive } from './agent-status';
import { getApiBaseUrl } from './config';
import { encodeNativeMessage } from './native-messaging-protocol';
import { loadDeviceToken } from './token-storage';

/**
 * Chrome spawns the native host manifest's "path" exe fresh on every chrome.runtime.connectNative()
 * call, passing the calling extension's origin as an argv entry — that's how the same packaged
 * exe can serve double duty as both the always-running background agent and the (Chrome-spawned,
 * short-lived) native messaging host, without needing two separate binaries.
 */
export function isNativeMessagingInvocation(argv: string[]): boolean {
  return argv.some((arg) => arg.startsWith('chrome-extension://'));
}

/**
 * Writes the device token plus this agent's own configured API base URL (or an error if not
 * yet registered / currently inactive) to stdout as one framed native message, then returns
 * so the process can exit. This is a push, not a request/response — the extension's
 * port.onMessage fires as soon as Chrome connects the port, no request needed. Checking
 * isAgentActive() here (the last periodic status-sync result), not just token presence, is
 * what fulfills "stop serving token to the extension" once a kiosk/device kill-switch flips —
 * see 04-PHASE-4-desktop-agent.md §5. Sending apiBaseUrl alongside the token is what lets a
 * real packaged extension (which otherwise only ever knows its own build-time default) find
 * the right backend without a manual chrome.storage.local override — the agent already has
 * the correct value baked in via SAVERLLY_API_BASE_URL at package time.
 */
export function respondWithDeviceToken(): void {
  const token = loadDeviceToken();
  let payload: NativeHostMessage;
  if (!token) {
    payload = { type: 'error', message: 'Device not registered yet' };
  } else if (!isAgentActive()) {
    payload = { type: 'error', message: 'Device or kiosk is currently inactive' };
  } else {
    payload = { type: 'device-token', token, apiBaseUrl: getApiBaseUrl() };
  }
  process.stdout.write(encodeNativeMessage(payload));
}
