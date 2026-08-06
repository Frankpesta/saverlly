import { NATIVE_MESSAGING_HOST_NAME } from '@saverlly/shared-types';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { nativeMessagingManifestPath } from './paths';

export const NATIVE_HOST_NAME = NATIVE_MESSAGING_HOST_NAME;
export const NATIVE_HOST_REGISTRY_KEY = `HKLM\\SOFTWARE\\Google\\Chrome\\NativeMessagingHosts\\${NATIVE_HOST_NAME}`;

export interface NativeMessagingRegistrationOptions {
  /** Defaults to the real per-machine Chrome native-messaging-hosts registry key — override only for isolated testing. */
  registryKey?: string;
  /** Defaults to %PROGRAMDATA%/KioskAgent/native-messaging-host.json — override only for isolated testing. */
  manifestPath?: string;
}

/**
 * Writes the native messaging host manifest + its per-machine registry pointer, so the
 * extension's chrome.runtime.connectNative(...) call can find and launch this exe. Call
 * unconditionally on every agent startup (self-healing against a registry/profile reset),
 * same as the Chrome force-install policy — see 04-PHASE-4-desktop-agent.md §3.
 */
export function ensureNativeMessagingHostRegistered(
  extensionId: string,
  exePath: string,
  options: NativeMessagingRegistrationOptions = {},
): void {
  if (!extensionId) {
    throw new Error('extensionId is required to register the native messaging host');
  }

  const manifestPath = options.manifestPath ?? nativeMessagingManifestPath();
  const manifest = {
    name: NATIVE_HOST_NAME,
    description: 'Saverlly Kiosk Agent native messaging host',
    path: exePath,
    type: 'stdio',
    allowed_origins: [`chrome-extension://${extensionId}/`],
  };
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

  const registryKey = options.registryKey ?? NATIVE_HOST_REGISTRY_KEY;
  execFileSync('reg', ['add', registryKey, '/ve', '/t', 'REG_SZ', '/d', manifestPath, '/f'], { stdio: 'ignore' });
}
