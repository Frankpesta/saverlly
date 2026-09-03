import * as path from 'path';

// %PROGRAMDATA% (machine-wide, not per-user) so the agent's identity survives a user
// profile reset and is visible regardless of which Windows account is logged in.
function programDataDir(): string {
  return process.env.PROGRAMDATA ?? 'C:\\ProgramData';
}

export function agentDir(): string {
  return path.join(programDataDir(), 'KioskAgent');
}

export function deviceIdentityFilePath(): string {
  return path.join(agentDir(), 'device.json');
}

export function tokenFilePath(): string {
  return path.join(agentDir(), 'token.enc');
}

export function nativeMessagingManifestPath(): string {
  return path.join(agentDir(), 'native-messaging-host.json');
}

export function announcementStateFilePath(): string {
  return path.join(agentDir(), 'announcement-state.json');
}

export function agentStatusStateFilePath(): string {
  return path.join(agentDir(), 'status-state.json');
}

export function announcementOverlayScriptPath(): string {
  return path.join(agentDir(), 'announcement-overlay.ps1');
}

/** The rendered announcement document the overlay's WebView2 control loads. Written next to the
 *  script, in %PROGRAMDATA% rather than the install dir, because the script is regenerated on
 *  every showing and Program Files isn't writable by the agent's relay task. */
export function announcementOverlayHtmlPath(): string {
  return path.join(agentDir(), 'announcement-overlay.html');
}

/**
 * Where the overlay (running as the logged-in user) reports back to the agent (running as
 * SYSTEM). A dedicated subfolder rather than agentDir() itself because it needs a widened ACL:
 * a folder created by SYSTEM under %PROGRAMDATA% gives plain Users read-only by default, so
 * without granting write here the overlay could never deliver its receipt and every announcement
 * would look like it failed.
 */
export function overlayExchangeDirPath(): string {
  return path.join(agentDir(), 'overlay');
}

/** Receipt written by the overlay: which attempt it was, and whether it actually rendered. */
export function announcementOverlayResultPath(): string {
  return path.join(overlayExchangeDirPath(), 'result.txt');
}

/**
 * Present while an overlay is on screen; removed when its window closes. Lets the agent avoid
 * dispatching a second announcement on top of one the kiosk user hasn't dismissed yet, a
 * localization-proof alternative to parsing `schtasks /query` output, whose Status field and
 * values are both translated.
 */
export function announcementOverlayLockPath(): string {
  return path.join(overlayExchangeDirPath(), 'overlay-active.lock');
}

/**
 * Where the vendored WebView2 host assemblies live at runtime: a `webview2` folder beside the
 * running exe, put there by the installer (see saverlly-agent.iss). Resolved from the exe's own
 * path. The same approach nativeMessagingHostExePath uses. So it follows the install location
 * instead of assuming one.
 */
export function webview2DirPath(mainExePath: string = process.execPath): string {
  return path.join(path.dirname(mainExePath), 'webview2');
}
