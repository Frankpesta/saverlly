import { spawn } from 'child_process';

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

/**
 * Renders a native (non-browser) overlay window on the main screen — kicked off detached
 * and fire-and-forget, since the dismiss action is local-only per spec (no result to await)
 * and the agent's poll loop must not block on the kiosk user actually clicking OK.
 */
export function showAnnouncementOverlay(title: string, body: string): void {
  const encodedCommand = Buffer.from(overlayScript(title, body), 'utf16le').toString('base64');
  const child = spawn(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-EncodedCommand', encodedCommand],
    { detached: true, stdio: 'ignore' },
  );
  child.unref();
}
