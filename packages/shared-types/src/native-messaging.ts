// Shared between apps/agent (native messaging host) and apps/extension (the client that
// calls chrome.runtime.connectNative) so the host name and message shape can't drift apart.
export const NATIVE_MESSAGING_HOST_NAME = 'com.saverlly.agent';

export type NativeHostMessage = { type: 'device-token'; token: string } | { type: 'error'; message: string };
