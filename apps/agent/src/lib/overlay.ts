import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import {
  createDefaultLayout,
  parseAnnouncementLayout,
  renderAnnouncementLayoutHtml,
  type ActiveAnnouncement,
} from '@saverlly/shared-types';
import {
  announcementOverlayHtmlPath,
  announcementOverlayScriptPath,
  webview2DirPath,
} from './paths';

export const ANNOUNCEMENT_OVERLAY_TASK_NAME = 'SaverllyAnnouncementOverlay';

/** The three assemblies scripts/fetch-webview2.js vendors. All must be present for the WebView2
 *  host to load; a partial copy means a broken install, not a usable one. */
export const WEBVIEW2_ASSEMBLIES = [
  'Microsoft.Web.WebView2.Core.dll',
  'Microsoft.Web.WebView2.WinForms.dll',
  'WebView2Loader.dll',
];

// PowerShell single-quoted strings only need '' -> ' escaping (no backtick/interpolation
// risk, since single-quoted PS strings are literal).
function psQuote(value: string): string {
  return value.replace(/'/g, "''");
}

/**
 * The WebView2-hosted overlay: a borderless, always-on-top window that renders the announcement's
 * saved canvas layout as real HTML.
 *
 * The document itself comes from @saverlly/shared-types' renderAnnouncementLayoutHtml — the exact
 * function the dashboard's editor previews with — so what a kiosk owner designed is what appears
 * here. This script's only job is to put a browser on screen and close when told to.
 */
function webView2OverlayScript(htmlPath: string, dllDir: string): string {
  return `
$ErrorActionPreference = 'Stop'

# WebView2 needs a writable user-data folder. The install dir is under Program Files, which the
# kiosk user can't write to, so this points it at their own profile instead — the relay task runs
# as them, so %LOCALAPPDATA% is theirs.
$env:WEBVIEW2_USER_DATA_FOLDER = Join-Path $env:LOCALAPPDATA 'SaverllyAgent\\WebView2'
New-Item -ItemType Directory -Force -Path $env:WEBVIEW2_USER_DATA_FOLDER | Out-Null

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type -Path '${psQuote(path.join(dllDir, 'Microsoft.Web.WebView2.Core.dll'))}'
Add-Type -Path '${psQuote(path.join(dllDir, 'Microsoft.Web.WebView2.WinForms.dll'))}'

$form = New-Object System.Windows.Forms.Form
$form.FormBorderStyle = 'None'
$form.StartPosition = 'CenterScreen'
$form.TopMost = $true
$form.ShowInTaskbar = $false
$form.BackColor = [System.Drawing.Color]::Black
# Sized to the working area rather than the full screen so the taskbar stays reachable — a kiosk
# user who somehow can't dismiss the overlay must not be locked out of the machine entirely.
$area = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
$form.Width = $area.Width
$form.Height = $area.Height

$web = New-Object Microsoft.Web.WebView2.WinForms.WebView2
$web.Dock = 'Fill'
$web.DefaultBackgroundColor = [System.Drawing.Color]::Black

$web.add_CoreWebView2InitializationCompleted({
  param($sender, $e)
  # A failed init leaves a blank black window with no way out, which is worse than showing
  # nothing at all — close instead and let the announcement be retried on the next poll.
  if (-not $e.IsSuccess) { $form.Close(); return }
  $settings = $sender.CoreWebView2.Settings
  $settings.AreDefaultContextMenusEnabled = $false
  $settings.AreDevToolsEnabled = $false
  $settings.IsStatusBarEnabled = $false
  $settings.IsZoomControlEnabled = $false
  $settings.AreBrowserAcceleratorKeysEnabled = $false
  # How the Dismiss button gets back to us: the rendered document posts 'saverlly:dismiss'.
  $sender.CoreWebView2.add_WebMessageReceived({
    param($messageSender, $messageArgs)
    if ($messageArgs.TryGetWebMessageAsString() -eq 'saverlly:dismiss') { $form.Close() }
  })
})

# Escape hatch for a layout whose dismiss button ended up unclickable (dragged off-canvas, or
# covered by another element). Without this the kiosk would need a reboot.
$form.KeyPreview = $true
$form.add_KeyDown({ param($keySender, $keyArgs) if ($keyArgs.KeyCode -eq 'Escape') { $form.Close() } })

$form.Controls.Add($web)
$web.Source = [Uri]'${psQuote(fileUrl(htmlPath))}'
$form.Add_Shown({ $form.Activate() })
[void]$form.ShowDialog()
`;
}

/** file:/// URL for a Windows path — WebView2's Source only accepts an absolute URI. */
function fileUrl(filePath: string): string {
  return `file:///${filePath.replace(/\\/g, '/')}`;
}

/**
 * The pre-canvas WinForms dialog, kept as a fallback for machines where the WebView2 host can't
 * run — an agent updated before the installer delivered the assemblies, or a stripped-down
 * Windows image without the runtime. Showing the old fixed layout is a real degradation (custom
 * positioning, fonts and colors are lost) but it still puts the announcement in front of the
 * kiosk user, which is the point.
 */
function legacyOverlayScript(title: string, body: string, mediaUrl?: string | null): string {
  return `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$form = New-Object System.Windows.Forms.Form
$form.Text = '${psQuote(title)}'
$form.StartPosition = 'CenterScreen'
$form.TopMost = $true
$form.FormBorderStyle = 'FixedDialog'
$form.MinimizeBox = $false
$form.MaximizeBox = $false
$form.Width = 480
$form.Height = 260
$okButton = New-Object System.Windows.Forms.Button
$okButton.Text = 'OK'
$okButton.Dock = 'Bottom'
$okButton.Height = 40
$okButton.Add_Click({ $form.Close() })
$form.Controls.Add($okButton)
$tempImagePath = $null
${
    mediaUrl
      ? `try {
  $tempImagePath = [System.IO.Path]::Combine([System.IO.Path]::GetTempPath(), 'saverlly-announcement-' + [System.Guid]::NewGuid().ToString() + '.img')
  Invoke-WebRequest -Uri '${psQuote(mediaUrl)}' -OutFile $tempImagePath -TimeoutSec 10 -UseBasicParsing
  $pictureBox = New-Object System.Windows.Forms.PictureBox
  $pictureBox.Image = [System.Drawing.Image]::FromFile($tempImagePath)
  $pictureBox.SizeMode = 'Zoom'
  $pictureBox.Dock = 'Top'
  $pictureBox.Height = 180
  $form.Controls.Add($pictureBox)
  $form.Height = $form.Height + 180
} catch {
  $tempImagePath = $null
}`
      : ''
  }
$label = New-Object System.Windows.Forms.Label
$label.Text = '${psQuote(body)}'
$label.AutoSize = $false
$label.Dock = 'Fill'
$label.Padding = New-Object System.Windows.Forms.Padding(16)
$label.TextAlign = 'MiddleCenter'
$label.Font = New-Object System.Drawing.Font('Segoe UI', 12)
$form.Controls.Add($label)
$form.AcceptButton = $okButton
$form.Add_Shown({ $form.Activate() })
$form.Add_FormClosed({ if ($tempImagePath -and (Test-Path $tempImagePath)) { Remove-Item $tempImagePath -Force -ErrorAction SilentlyContinue } })
[void]$form.ShowDialog()
`;
}

/** True when every vendored assembly is present, i.e. the WebView2 host can actually be loaded. */
export function hasWebView2Assemblies(dllDir: string): boolean {
  return WEBVIEW2_ASSEMBLIES.every((name) => fs.existsSync(path.join(dllDir, name)));
}

/** Whoever is logged into the local console right now, or null if no one is (e.g. sitting at
 * the lock/login screen). The always-on background agent runs as SYSTEM in Windows Session 0
 * (see run-at-login.ts's `/ru SYSTEM`), which has no desktop of its own to render a popup on —
 * this is how it finds out whose session to hand the popup off to instead. Works from a
 * SYSTEM/no-admin-token context via WMI; no token duplication or native addon needed. */
export function getInteractiveUsername(): string | null {
  let output: string;
  try {
    output = execFileSync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', '(Get-CimInstance Win32_ComputerSystem).UserName'],
      { encoding: 'utf8' },
    );
  } catch {
    return null;
  }
  const username = output.trim();
  return username.length > 0 ? username : null;
}

/** (Re)registers the scheduled task that actually renders the popup, targeting whichever user
 * is currently logged in. `/it` (interactive token) is what lets Task Scheduler launch it in
 * that user's real session without needing their password on file. Unconditionally overwritten
 * on every call — same self-healing-over-diffing approach as chrome-policy.ts's
 * writeListPolicy — so a kiosk where a different user ends up logged in next time just works,
 * with no stale-task-targeting-the-wrong-user state to go stale. The far-future one-time
 * trigger (`/sc once /sd 01/01/2199`) means the task itself never fires on its own; it only ever
 * runs when explicitly triggered via `schtasks /run`, right below.
 *
 * Unchanged by the move to WebView2: the Session-0 handoff problem is about *which desktop* the
 * process lands on, which is independent of what it draws once it gets there. */
function ensureOverlayRelayTask(username: string, scriptPath: string): void {
  execFileSync(
    'schtasks',
    [
      '/create',
      '/tn',
      ANNOUNCEMENT_OVERLAY_TASK_NAME,
      '/tr',
      `powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "${scriptPath}"`,
      '/sc',
      'once',
      '/sd',
      '01/01/2199',
      '/st',
      '00:00',
      '/ru',
      username,
      '/it',
      '/rl',
      'limited',
      '/f',
    ],
    { stdio: 'ignore' },
  );
}

export interface ShowOverlayOptions {
  /** Where the WebView2 host assemblies live. Defaults to a `webview2` folder beside the running
   *  exe; overridable for tests. */
  webview2Dir?: string;
}

/**
 * Renders the announcement on the kiosk's screen — fire-and-forget, since the dismiss action is
 * local-only per spec (no result to await) and the agent's poll loop must not block on the kiosk
 * user actually clicking Dismiss.
 *
 * The background agent runs as SYSTEM in Session 0 (no visible desktop), so a direct
 * `spawn('powershell.exe', ...)` here would report success while being physically invisible to
 * whoever's using the kiosk — confirmed the real cause of "created an announcement, never saw
 * it" reports. Instead, this writes the popup script to disk and relays it through a per-user
 * scheduled task, which Task Scheduler correctly launches inside the logged-in user's own
 * session (see ensureOverlayRelayTask/getInteractiveUsername above).
 *
 * Returns false (and shows nothing) if nobody is currently logged in — e.g. at the lock/login
 * screen — so callers can avoid marking a ONCE/MAX_N_TIMES announcement as shown when no one
 * could have actually seen it.
 */
export function showAnnouncementOverlay(
  announcement: ActiveAnnouncement,
  options: ShowOverlayOptions = {},
): boolean {
  const username = getInteractiveUsername();
  if (!username) {
    return false;
  }

  const scriptPath = announcementOverlayScriptPath();
  fs.mkdirSync(path.dirname(scriptPath), { recursive: true });

  const dllDir = options.webview2Dir ?? webview2DirPath();
  if (hasWebView2Assemblies(dllDir)) {
    // Announcements authored before the canvas editor have no layout; rendering the equivalent
    // default design keeps them working on the new pipeline instead of showing an empty screen.
    // Re-parsed rather than trusted, for the same reason the backend re-parses on the way out:
    // this JSON becomes an HTML document running on the kiosk.
    const layout =
      parseAnnouncementLayout(announcement.layout) ??
      createDefaultLayout({
        title: announcement.title,
        body: announcement.body,
        mediaUrl: announcement.mediaUrl,
      });

    const htmlPath = announcementOverlayHtmlPath();
    fs.writeFileSync(htmlPath, renderAnnouncementLayoutHtml(layout), 'utf8');
    fs.writeFileSync(scriptPath, webView2OverlayScript(htmlPath, dllDir), 'utf8');
  } else {
    fs.writeFileSync(
      scriptPath,
      legacyOverlayScript(announcement.title, announcement.body, announcement.mediaUrl),
      'utf8',
    );
  }

  ensureOverlayRelayTask(username, scriptPath);
  execFileSync('schtasks', ['/run', '/tn', ANNOUNCEMENT_OVERLAY_TASK_NAME], { stdio: 'ignore' });
  return true;
}
