import { NATIVE_MESSAGING_HOST_NAME } from '@saverlly/shared-types';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { nativeMessagingManifestPath } from './paths';

export const NATIVE_HOST_NAME = NATIVE_MESSAGING_HOST_NAME;
export const NATIVE_HOST_REGISTRY_KEY = `HKLM\\SOFTWARE\\Google\\Chrome\\NativeMessagingHosts\\${NATIVE_HOST_NAME}`;

// The packaged main exe (saverlly-agent.exe) embeds a requireAdministrator manifest, needed
// for its own HKLM/scheduled-task writes when running as the background agent or the
// interactive first-run bootstrap. Chrome, however, launches a native messaging host via a
// plain CreateProcess call (not ShellExecute) — against an exe whose manifest requests
// elevation, that fails outright with ERROR_ELEVATION_REQUIRED, no UAC prompt, no message
// ever written. So the manifest must point at a *sibling*, non-elevated exe built from the
// same dist/main.js instead (see scripts/package.js) — same argv-dispatch logic, just packaged
// without the requireAdministrator manifest.
export const NATIVE_MESSAGING_HOST_EXE_NAME = 'saverlly-agent-host.exe';

/** Computes the sibling unprivileged host exe's path from the elevated main exe's own path. */
export function nativeMessagingHostExePath(mainExePath: string): string {
  return path.join(path.dirname(mainExePath), NATIVE_MESSAGING_HOST_EXE_NAME);
}

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
