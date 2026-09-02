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
  announcementOverlayLockPath,
  announcementOverlayResultPath,
  announcementOverlayScriptPath,
  overlayExchangeDirPath,
  webview2DirPath,
} from './paths';

export const ANNOUNCEMENT_OVERLAY_TASK_NAME = 'SaverllyAnnouncementOverlay';

/**
 * How long to wait for the overlay to report that it actually rendered. This waits for the
 * *render*, not for the kiosk user to dismiss it — the window stays up long after this.
 *
 * Generous on purpose: WebView2's first initialization against a fresh user-data folder (i.e. the
 * first announcement ever shown to a given Windows account) measured well over 20s on a warm dev
 * box, while every subsequent one was near-instant. Timing out early there would report a failure
 * for an overlay that does appear a moment later. A late receipt is not harmful even so — the
 * lock file makes the next cycle return `already-showing`, which is transient and doesn't consume
 * the retry budget — but the cheap fix is simply not to be impatient.
 */
export const OVERLAY_RENDER_TIMEOUT_MS = 60_000;
const OVERLAY_RECEIPT_POLL_MS = 250;

/** An overlay left on screen this long is treated as abandoned (killed process, logoff mid-show)
 *  rather than as a genuinely open window blocking the next announcement. */
export const OVERLAY_LOCK_STALE_MS = 30 * 60_000;

/** Why an announcement didn't make it onto the screen. Only `shown: true` may be recorded as
 *  displayed — everything else means the kiosk user saw nothing. */
export type OverlayResult =
  | { shown: true; renderer: 'webview2' | 'legacy' }
  | {
      shown: false;
      reason:
        | 'no-interactive-user'
        | 'already-showing'
        | 'dispatch-failed'
        | 'render-failed'
        | 'render-timeout';
      detail?: string;
    };

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

interface ScriptContext {
  attemptId: string;
  resultPath: string;
  lockPath: string;
}

/**
 * Wraps a renderer's PowerShell in the reporting harness both renderers share: take the
 * on-screen lock, run the body, and report back exactly one receipt.
 *
 * Everything is inside try/catch/finally so that *no* failure mode is silent — a missing
 * assembly, a broken runtime, a malformed layout — because the agent treats "no receipt" as
 * "the kiosk user saw nothing", and a script that dies without reporting would otherwise be
 * indistinguishable from one that never ran.
 */
function wrapOverlayScript(context: ScriptContext, body: string): string {
  return `
$ErrorActionPreference = 'Stop'
$attemptId = '${psQuote(context.attemptId)}'
$resultPath = '${psQuote(context.resultPath)}'
$lockPath = '${psQuote(context.lockPath)}'
$reported = $false

function Write-OverlayResult {
  param($Status, $Reason)
  # First writer wins: an init failure must not be overwritten by a later shutdown path.
  if ($script:reported) { return }
  $script:reported = $true
  try {
    $tmp = $resultPath + '.tmp'
    $clean = ''
    if ($Reason) { $clean = ($Reason -replace '\\s+', ' ') }
    # Written to a temp file and moved so the agent can never read a half-written receipt.
    Set-Content -LiteralPath $tmp -Value ($attemptId + "\`n" + $Status + "\`n" + $clean) -Encoding UTF8 -Force
    Move-Item -LiteralPath $tmp -Destination $resultPath -Force
  } catch { }
}

try { Set-Content -LiteralPath $lockPath -Value $attemptId -Encoding UTF8 -Force } catch { }

try {
${body}
} catch {
  Write-OverlayResult 'failed' $_.Exception.Message
} finally {
  # If the body somehow returned without reporting, say so rather than leaving the agent to
  # time out — a wrong-but-explicit answer arrives 20s sooner than silence.
  Write-OverlayResult 'failed' 'overlay exited without rendering'
  try { Remove-Item -LiteralPath $lockPath -Force -ErrorAction SilentlyContinue } catch { }
}
`;
}

/**
 * The WebView2-hosted overlay: a borderless, always-on-top window that renders the announcement's
 * saved canvas layout as real HTML.
 *
 * The document itself comes from @saverlly/shared-types' renderAnnouncementLayoutHtml — the exact
 * function the dashboard's editor previews with — so what a kiosk owner designed is what appears
 * here. This script's only job is to put a browser on screen and close when told to.
 */
function webView2OverlayScript(htmlPath: string, dllDir: string, context: ScriptContext): string {
  return wrapOverlayScript(
    context,
    `
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
  # nothing at all — report it and close, so the agent knows not to count this as shown.
  if (-not $e.IsSuccess) {
    Write-OverlayResult 'failed' ('CoreWebView2 initialization failed: ' + $e.InitializationException.Message)
    $form.Close()
    return
  }
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
# Reported once the document has actually painted, not merely when the control initialized —
# NavigationCompleted is the closest signal to "the kiosk user is looking at it".
$web.add_NavigationCompleted({
  param($navSender, $navArgs)
  if ($navArgs.IsSuccess) { Write-OverlayResult 'rendered' '' }
  else { Write-OverlayResult 'failed' ('navigation failed: ' + $navArgs.WebErrorStatus) }
})
$form.Add_Shown({ $form.Activate() })
[void]$form.ShowDialog()
`,
  );
}

/** file:/// URL for a Windows path — WebView2's Source only accepts an absolute URI. */
function fileUrl(filePath: string): string {
  return `file:///${filePath.replace(/\\/g, '/')}`;
}

/**
 * The pre-canvas WinForms dialog, kept as a fallback for machines where the WebView2 overlay
 * can't run — an agent updated before the installer delivered the assemblies, a kiosk that was
 * offline when the runtime bootstrapper would have run, or the gap between file extraction and
 * that bootstrapper during a fresh install. Showing the old fixed layout is a real degradation
 * (custom positioning, fonts and colors are lost) but it still puts the announcement in front of
 * the kiosk user, which is the whole point of having a fallback at all.
 */
function legacyOverlayScript(
  title: string,
  body: string,
  mediaUrl: string | null | undefined,
  context: ScriptContext,
): string {
  return wrapOverlayScript(
    context,
    `
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
$form.Add_Shown({ $form.Activate(); Write-OverlayResult 'rendered' '' })
$form.Add_FormClosed({ if ($tempImagePath -and (Test-Path $tempImagePath)) { Remove-Item $tempImagePath -Force -ErrorAction SilentlyContinue } })
[void]$form.ShowDialog()
`,
  );
}

/** True when every vendored assembly is present, i.e. `Add-Type` will succeed. */
export function hasWebView2Assemblies(dllDir: string): boolean {
  return WEBVIEW2_ASSEMBLIES.every((name) => fs.existsSync(path.join(dllDir, name)));
}

/**
 * Where the Evergreen runtime records itself. Same three keys the installer's
 * `WebView2RuntimeMissing` checks: a per-machine install writes to HKLM (under WOW6432Node on
 * 64-bit), a per-user one to HKCU. In practice the agent runs as SYSTEM, so HKLM is the one that
 * will match — HKCU is checked for parity with the installer rather than because it's likely.
 */
export const WEBVIEW2_RUNTIME_KEYS = [
  'HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\EdgeUpdate\\Clients\\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}',
  'HKLM\\SOFTWARE\\Microsoft\\EdgeUpdate\\Clients\\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}',
  'HKCU\\SOFTWARE\\Microsoft\\EdgeUpdate\\Clients\\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}',
];

/**
 * Whether the WebView2 *runtime* (the browser itself) is installed, as opposed to the host
 * assemblies that talk to it. A `pv` of '0.0.0.0' means "known but not actually installed" and
 * counts as missing — Microsoft's own documented check.
 */
export function isWebView2RuntimeInstalled(): boolean {
  for (const key of WEBVIEW2_RUNTIME_KEYS) {
    let output: string;
    try {
      output = execFileSync('reg', ['query', key, '/v', 'pv'], { encoding: 'utf8' });
    } catch {
      continue; // key absent — reg exits nonzero
    }
    const match = /\bpv\s+REG_SZ\s+(\S+)/i.exec(output);
    if (match && match[1] !== '0.0.0.0') {
      return true;
    }
  }
  return false;
}

/**
 * Whether the WebView2 overlay can actually be *rendered*, which needs both halves: the vendored
 * host assemblies AND the runtime they drive.
 *
 * Checking only for the assemblies was a real bug. The installer copies them during file
 * extraction but installs the runtime afterwards (and skips it entirely when offline), so there
 * is a window — including the `--setup-once` run's very first announcement poll — where the DLLs
 * exist but the runtime doesn't. The overlay would then take the WebView2 path, fail to
 * initialize, close itself, and show the kiosk user nothing at all. Worse, because dispatching
 * the overlay is fire-and-forget, the announcement was still recorded as shown — burning a
 * ONCE announcement's single appearance on a blank screen.
 */
export function canRenderWebView2Overlay(dllDir: string): boolean {
  return hasWebView2Assemblies(dllDir) && isWebView2RuntimeInstalled();
}

/**
 * Creates the exchange folder and grants Users modify access on it.
 *
 * The agent runs as SYSTEM, so a folder it creates under %PROGRAMDATA% leaves plain Users with
 * read-only access — and the overlay runs as the *logged-in user*. Without this grant the
 * overlay could never write its receipt, so every announcement would look like it failed to
 * render and none would ever be recorded as shown.
 *
 * `*S-1-5-32-545` is the well-known SID for BUILTIN\Users; the literal name is localized and
 * would fail outright on a non-English Windows install.
 */
function ensureOverlayExchangeDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
  try {
    execFileSync('icacls', [dir, '/grant', '*S-1-5-32-545:(OI)(CI)M', '/T', '/C', '/Q'], {
      stdio: 'ignore',
    });
  } catch {
    // Best-effort: on a machine where this fails the receipt won't arrive, the overlay is
    // reported as timed out, and the bounded retry in announcement-state gives up rather than
    // looping. Losing the ACL is not worth failing the whole showing over.
  }
}

/**
 * Whether an overlay is currently on the kiosk's screen. Dispatching a second one on top of an
 * undismissed first would either fail (the relay task is already running) or stack windows, and
 * either way the second announcement would be recorded as shown without anyone seeing it.
 *
 * A lock file rather than `schtasks /query` parsing because that command's Status field *and*
 * its values are localized. A lock older than OVERLAY_LOCK_STALE_MS is treated as abandoned —
 * a killed process or a logoff mid-show would otherwise block announcements forever.
 */
export function isOverlayShowing(lockPath: string = announcementOverlayLockPath()): boolean {
  try {
    const age = Date.now() - fs.statSync(lockPath).mtimeMs;
    return age >= 0 && age < OVERLAY_LOCK_STALE_MS;
  } catch {
    return false; // no lock file at all
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface OverlayReceipt {
  status: string;
  reason: string;
}

/**
 * Reads the overlay's receipt, but only if it belongs to `attemptId` — a receipt left behind by
 * an earlier announcement must never be mistaken for this one's, which is exactly what would
 * happen if the file's mere existence were treated as success.
 */
function readOverlayReceipt(resultPath: string, attemptId: string): OverlayReceipt | null {
  let raw: string;
  try {
    raw = fs.readFileSync(resultPath, 'utf8');
  } catch {
    return null;
  }
  // PowerShell 5.1's `Set-Content -Encoding UTF8` writes a BOM.
  const [id, status, ...rest] = raw.replace(/^﻿/, '').split(/\r?\n/);
  if (id?.trim() !== attemptId) return null;
  return { status: (status ?? '').trim(), reason: rest.join(' ').trim() };
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
  /** How long to wait for the overlay's "I rendered" receipt. Overridable for tests. */
  renderTimeoutMs?: number;
  /** How often to check for that receipt. Overridable for tests. */
  receiptPollMs?: number;
}

/** Distinct per showing, so a receipt can never be attributed to the wrong attempt. */
function newAttemptId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Puts the announcement on the kiosk's screen and waits long enough to find out whether it
 * actually appeared.
 *
 * The background agent runs as SYSTEM in Session 0 (no visible desktop), so a direct
 * `spawn('powershell.exe', ...)` here would report success while being physically invisible to
 * whoever's using the kiosk — confirmed the real cause of "created an announcement, never saw
 * it" reports. Instead, this writes the popup script to disk and relays it through a per-user
 * scheduled task, which Task Scheduler correctly launches inside the logged-in user's own
 * session (see ensureOverlayRelayTask/getInteractiveUsername above).
 *
 * Because that relay is asynchronous and cross-session, dispatching it successfully says nothing
 * about whether anything rendered. The overlay therefore writes back a receipt, and this waits
 * for it — the caller must only record an announcement as shown on `shown: true`. The wait is for
 * the *render*, not the dismissal: the window stays up long after this returns, so the poll loop
 * is never blocked on a kiosk user's attention.
 *
 * Never throws. Every failure mode resolves to a `shown: false` reason, because an exception
 * escaping here would abort the whole poll cycle and take the remaining announcements with it.
 */
export async function showAnnouncementOverlay(
  announcement: ActiveAnnouncement,
  options: ShowOverlayOptions = {},
): Promise<OverlayResult> {
  const resultPath = announcementOverlayResultPath();
  const lockPath = announcementOverlayLockPath();

  try {
    const username = getInteractiveUsername();
    if (!username) {
      return { shown: false, reason: 'no-interactive-user' };
    }

    // Never stack a second overlay on an undismissed one.
    if (isOverlayShowing(lockPath)) {
      return { shown: false, reason: 'already-showing' };
    }

    const attemptId = newAttemptId();
    const context: ScriptContext = { attemptId, resultPath, lockPath };

    ensureOverlayExchangeDir(overlayExchangeDirPath());
    // A leftover receipt is already ignored by the attempt-id check; clearing it just keeps the
    // folder honest about what happened most recently.
    try {
      fs.rmSync(resultPath, { force: true });
    } catch {
      /* best-effort */
    }

    const scriptPath = announcementOverlayScriptPath();
    fs.mkdirSync(path.dirname(scriptPath), { recursive: true });

    const dllDir = options.webview2Dir ?? webview2DirPath();
    const renderer: 'webview2' | 'legacy' = canRenderWebView2Overlay(dllDir) ? 'webview2' : 'legacy';

    if (renderer === 'webview2') {
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
      fs.writeFileSync(scriptPath, webView2OverlayScript(htmlPath, dllDir, context), 'utf8');
    } else {
      fs.writeFileSync(
        scriptPath,
        legacyOverlayScript(announcement.title, announcement.body, announcement.mediaUrl, context),
        'utf8',
      );
    }

    try {
      ensureOverlayRelayTask(username, scriptPath);
      execFileSync('schtasks', ['/run', '/tn', ANNOUNCEMENT_OVERLAY_TASK_NAME], {
        stdio: 'ignore',
      });
    } catch (err) {
      return {
        shown: false,
        reason: 'dispatch-failed',
        detail: err instanceof Error ? err.message : String(err),
      };
    }

    const timeoutMs = options.renderTimeoutMs ?? OVERLAY_RENDER_TIMEOUT_MS;
    const pollMs = options.receiptPollMs ?? OVERLAY_RECEIPT_POLL_MS;
    const deadline = Date.now() + timeoutMs;

    for (;;) {
      const receipt = readOverlayReceipt(resultPath, attemptId);
      if (receipt) {
        if (receipt.status === 'rendered') {
          return { shown: true, renderer };
        }
        return { shown: false, reason: 'render-failed', detail: receipt.reason };
      }
      if (Date.now() >= deadline) {
        return { shown: false, reason: 'render-timeout' };
      }
      await delay(pollMs);
    }
  } catch (err) {
    return {
      shown: false,
      reason: 'dispatch-failed',
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}
