import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { announcementOverlayScriptPath } from './paths';

export const ANNOUNCEMENT_OVERLAY_TASK_NAME = 'SaverllyAnnouncementOverlay';

// PowerShell single-quoted strings only need '' -> ' escaping (no backtick/interpolation
// risk, since single-quoted PS strings are literal).
function psQuote(value: string): string {
  return value.replace(/'/g, "''");
}

function overlayScript(title: string, body: string): string {
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
$label = New-Object System.Windows.Forms.Label
$label.Text = '${psQuote(body)}'
$label.AutoSize = $false
$label.Dock = 'Fill'
$label.Padding = New-Object System.Windows.Forms.Padding(16)
$label.TextAlign = 'MiddleCenter'
$label.Font = New-Object System.Drawing.Font('Segoe UI', 12)
$form.Controls.Add($label)
$okButton = New-Object System.Windows.Forms.Button
$okButton.Text = 'OK'
$okButton.Dock = 'Bottom'
$okButton.Height = 40
$okButton.Add_Click({ $form.Close() })
$form.Controls.Add($okButton)
$form.AcceptButton = $okButton
$form.Add_Shown({ $form.Activate() })
[void]$form.ShowDialog()
`;
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
 * runs when explicitly triggered via `schtasks /run`, right below. */
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

/**
 * Renders a native (non-browser) overlay window on the kiosk's screen — fire-and-forget, since
 * the dismiss action is local-only per spec (no result to await) and the agent's poll loop must
 * not block on the kiosk user actually clicking OK.
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
export function showAnnouncementOverlay(title: string, body: string): boolean {
  const username = getInteractiveUsername();
  if (!username) {
    return false;
  }

  const scriptPath = announcementOverlayScriptPath();
  fs.mkdirSync(path.dirname(scriptPath), { recursive: true });
  fs.writeFileSync(scriptPath, overlayScript(title, body), 'utf8');

  ensureOverlayRelayTask(username, scriptPath);
  execFileSync('schtasks', ['/run', '/tn', ANNOUNCEMENT_OVERLAY_TASK_NAME], { stdio: 'ignore' });
  return true;
}
