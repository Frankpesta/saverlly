; Saverlly Kiosk Agent installer.
;
; Replaces the previous "download a zip, extract two exes manually, double-click one, type a
; setup code into a console window" flow with a single branded installer: one UAC prompt (the
; normal ShellExecute-based prompt Explorer shows for a manifest-tagged exe on double-click —
; NOT the same non-elevating launch path that broke Chrome's native-messaging spawn earlier),
; an affiliate-disclosure acceptance page, a wizard page asking for the setup code, then done.
; See apps/agent/scripts/package.js for how this gets compiled (ISCC) as part of `npm run package`.
;
; The disclosure and setup-code pages both only appear on a genuine first connection. Re-running
; this installer over a machine that's already registered (an upgrade, a repair, or someone
; double-clicking it again) skips straight past both — see ShouldSkipPage/IsDeviceAlreadyRegistered
; in [Code] below.
;
; AppId is a fixed GUID (not regenerated per build) so future installer versions are recognized
; as upgrades of the same product in Add/Remove Programs, not a separate install.
#define MyAppId "{{9C494505-6284-4818-959B-7C93B32D53FB}"
#define MyAppName "Saverlly Kiosk Agent"
#define MyAppVersion "0.1.0"
#define MyAppPublisher "Saverlly"

[Setup]
AppId={#MyAppId}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\Saverlly Kiosk Agent
DisableProgramGroupPage=yes
; No reason for a kiosk owner to change the install location or see a Start Menu page for a
; headless background agent with no shortcuts — fewer decisions, per the "not computer savvy"
; brief this installer exists to satisfy.
DisableDirPage=yes
PrivilegesRequired=admin
OutputDir=..\release
OutputBaseFilename=SaverllyAgentSetup
Compression=lzma
SolidCompression=yes
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
WizardStyle=modern
WizardImageFile=assets\wizard.png
WizardSmallImageFile=assets\small.png
UninstallDisplayName={#MyAppName}

[Files]
; saverlly-agent-host.exe is never run directly by the installer or the kiosk owner — it must
; simply exist alongside saverlly-agent.exe, since main.ts's nativeMessagingHostExePath()
; resolves it as a sibling of wherever the main exe is currently running from (see
; apps/agent/src/lib/native-messaging-host.ts). Both exes landing in the same {app} directory
; here is what makes that resolution correct.
Source: "..\release\saverlly-agent.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\release\saverlly-agent-host.exe"; DestDir: "{app}"; Flags: ignoreversion

; The announcement overlay hosts a WebView2 control from PowerShell so it can render the kiosk
; owner's saved canvas layout as real HTML (see apps/agent/src/lib/overlay.ts). These are the
; .NET Framework host assemblies it loads with Add-Type; paths.ts's webview2DirPath() resolves
; this exact folder as a sibling of the running exe. Vendored by scripts/fetch-webview2.js.
; Without them the overlay silently degrades to the old fixed WinForms dialog.
Source: "..\vendor\webview2\*.dll"; DestDir: "{app}\webview2"; Flags: ignoreversion

; The runtime itself is a separate machine-wide component. Ship the ~2MB Evergreen bootstrapper
; and run it only when the runtime is genuinely absent (most Windows 10/11 machines already have
; it, since Edge installs it) — see WebView2RuntimeMissing below.
Source: "..\vendor\MicrosoftEdgeWebview2Setup.exe"; DestDir: "{tmp}"; Flags: deleteafterinstall; Check: WebView2RuntimeMissing

[Run]
; Silent, and deliberately NOT fatal: a kiosk that's offline at install time still gets a working
; agent, it just falls back to the legacy overlay until the runtime turns up. Runs after
; ssPostInstall, which is fine — nothing in --setup-once needs WebView2.
Filename: "{tmp}\MicrosoftEdgeWebview2Setup.exe"; Parameters: "/silent /install"; StatusMsg: "Installing the WebView2 runtime..."; Flags: waituntilterminated skipifdoesntexist; Check: WebView2RuntimeMissing

[Code]
var
  TermsPage: TWizardPage;
  TermsCheckBox: TNewCheckBox;
  SetupCodePage: TInputQueryWizardPage;
  AgentSetupSucceeded: Boolean;
  AgentSetupResultCode: Integer;

const
  DisclosureUrl = 'https://saverlly.com/affiliate-disclosure/';

// True once this machine already holds a device token -- registration (see
// apps/agent/src/lib/registration.ts's ensureRegistered) never re-runs while one is on disk, so a
// reinstall/upgrade/repair over an already-connected kiosk has nothing new to agree to or enter.
// Path must match apps/agent/src/lib/paths.ts's tokenFilePath() (agentDir() + 'token.enc') exactly.
function IsDeviceAlreadyRegistered: Boolean;
begin
  Result := FileExists(ExpandConstant('{commonappdata}\KioskAgent\token.enc'));
end;

procedure OpenDisclosureLink(Sender: TObject);
var
  ErrorCode: Integer;
begin
  ShellExec('open', DisclosureUrl, '', '', SW_SHOWNORMAL, ewNoWait, ErrorCode);
end;

// Microsoft's documented way to detect the Evergreen runtime: a non-empty `pv` under the
// WebView2 client GUID. A per-machine install writes to HKLM (under WOW6432Node on 64-bit), a
// per-user one to HKCU, so all three are checked. `pv` of '0.0.0.0' specifically means "known
// but not actually installed" and must be treated as missing.
//
// The GUID braces are safe unescaped here: Inno only expands {constants} in [Files]/[Run]
// parameters, never inside a [Code] Pascal string literal.
function WebView2RuntimeMissing: Boolean;
var
  Version: String;
begin
  if RegQueryStringValue(HKLM, 'SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}', 'pv', Version) then
  begin
    Result := (Version = '') or (Version = '0.0.0.0');
    Exit;
  end;
  if RegQueryStringValue(HKLM, 'SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}', 'pv', Version) then
  begin
    Result := (Version = '') or (Version = '0.0.0.0');
    Exit;
  end;
  if RegQueryStringValue(HKCU, 'SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}', 'pv', Version) then
  begin
    Result := (Version = '') or (Version = '0.0.0.0');
    Exit;
  end;
  Result := True;
end;

procedure InitializeWizard;
var
  Memo: TNewMemo;
  LinkButton: TNewButton;
begin
  // Shown once, before the setup-code page, on a genuinely new connection only -- see
  // ShouldSkipPage. The full legal text lives at DisclosureUrl, not copied here, so this page
  // can never drift out of sync with the real, currently-published disclosure.
  TermsPage := CreateCustomPage(wpWelcome,
    'Affiliate Disclosure',
    'Please review and accept before continuing');

  Memo := TNewMemo.Create(TermsPage);
  Memo.Parent := TermsPage.Surface;
  Memo.Left := 0;
  Memo.Top := 0;
  Memo.Width := TermsPage.SurfaceWidth;
  Memo.Height := ScaleY(170);
  Memo.ScrollBars := ssVertical;
  Memo.ReadOnly := True;
  Memo.Text :=
    'Saverlly may earn an affiliate commission when a customer applies a coupon through this ' +
    'kiosk and completes a purchase. This never increases the price the customer pays, and ' +
    'Saverlly is not a public coupon website. Saverlly only participates in affiliate programs ' +
    'that support extension-based tracking in private kiosk environments, and may share a ' +
    'portion of commissions with the kiosk owner.' + #13#10 + #13#10 +
    'By continuing, you agree to Saverlly''s Affiliate Disclosure and Terms of Service. The ' +
    'full, current version is always available at:' + #13#10 + DisclosureUrl;

  LinkButton := TNewButton.Create(TermsPage);
  LinkButton.Parent := TermsPage.Surface;
  LinkButton.Left := 0;
  LinkButton.Top := Memo.Top + Memo.Height + ScaleY(12);
  LinkButton.Width := ScaleX(160);
  LinkButton.Height := ScaleY(23);
  LinkButton.Caption := 'Open in browser...';
  LinkButton.OnClick := @OpenDisclosureLink;

  TermsCheckBox := TNewCheckBox.Create(TermsPage);
  TermsCheckBox.Parent := TermsPage.Surface;
  TermsCheckBox.Left := 0;
  TermsCheckBox.Top := LinkButton.Top + LinkButton.Height + ScaleY(16);
  TermsCheckBox.Width := TermsPage.SurfaceWidth;
  TermsCheckBox.Height := ScaleY(17);
  TermsCheckBox.Caption := 'I have read and agree to the Affiliate Disclosure and Terms of Service';
  TermsCheckBox.Checked := False;

  SetupCodePage := CreateInputQueryPage(TermsPage.ID,
    'Connect Your Location',
    'Enter your Saverlly setup code',
    'You''ll find this in your welcome email, or you can ask your Saverlly admin for it.');
  SetupCodePage.Add('Setup code:', False);
end;

// A machine that already has a device token is being upgraded/repaired, not connected for the
// first time -- it has nothing left to agree to or enter. See IsDeviceAlreadyRegistered.
function ShouldSkipPage(PageID: Integer): Boolean;
begin
  Result := ((PageID = TermsPage.ID) or (PageID = SetupCodePage.ID)) and IsDeviceAlreadyRegistered;
end;

function NextButtonClick(CurPageID: Integer): Boolean;
begin
  Result := True;
  if CurPageID = TermsPage.ID then
  begin
    if not TermsCheckBox.Checked then
    begin
      MsgBox('Please confirm you have read and agree to the Affiliate Disclosure and Terms of ' +
        'Service to continue.', mbError, MB_OK);
      Result := False;
    end;
  end;
  if CurPageID = SetupCodePage.ID then
  begin
    if Trim(SetupCodePage.Values[0]) = '' then
    begin
      MsgBox('Please enter your setup code to continue.', mbError, MB_OK);
      Result := False;
    end;
  end;
end;

// Runs after files are extracted to {app} — this is the "--setup-once" invocation described in
// apps/agent/src/lib/installer-mode.ts: registers the device, creates the scheduled task, and
// applies the Chrome policy / native-messaging registration, then exits with a real code
// instead of the persistent background agent's infinite loop. SW_HIDE means no console window
// is ever visible; ewWaitUntilTerminated blocks the wizard until it's actually done, so the
// finish page can honestly report success or failure.
procedure CurStepChanged(CurStep: TSetupStep);
var
  ResultCode: Integer;
  Params: String;
begin
  if CurStep = ssPostInstall then
  begin
    Params := '--setup-once --setup-code="' + Trim(SetupCodePage.Values[0]) + '"';
    AgentSetupSucceeded := Exec(ExpandConstant('{app}\saverlly-agent.exe'), Params, '',
      SW_HIDE, ewWaitUntilTerminated, ResultCode) and (ResultCode = 0);
    AgentSetupResultCode := ResultCode;
    if not AgentSetupSucceeded then
      MsgBox('Saverlly setup could not complete. Please double-check your setup code and run ' +
        'this installer again.' + #13#10#13#10 + 'Error code: ' + IntToStr(AgentSetupResultCode),
        mbError, MB_OK);
  end;
end;

[UninstallRun]
; MUST run before AgentUninstallCleanup below. The already-running background agent (started at
; last logon by the SaverllyKioskAgent scheduled task, running forever via main.ts's
; runBackgroundAgent setInterval loop) is still alive at this point and unconditionally
; re-applies the Chrome ExtensionInstallForcelist/Allowlist policy every STATUS_SYNC_INTERVAL_MS
; (status-sync.ts's runStatusSync — that's what "self-healing" means). If it isn't killed first,
; its very next cycle re-writes Forcelist/Allowlist right back after AgentUninstallCleanup below
; clears them, fighting the uninstall and leaving the extension force-installed. taskkill exits
; nonzero ("not found") when no instance is running, which is fine — Inno doesn't treat that as
; fatal for [UninstallRun] entries. /T also kills the native-messaging host exe if one happens
; to be running as a child at this exact moment.
Filename: "{sys}\taskkill.exe"; Parameters: "/F /IM saverlly-agent.exe /T"; Flags: runhidden; RunOnceId: "KillRunningAgent"
Filename: "{sys}\taskkill.exe"; Parameters: "/F /IM saverlly-agent-host.exe /T"; Flags: runhidden; RunOnceId: "KillRunningAgentHost"
; Runs next, now that no competing background instance can undo it, while {app}\saverlly-agent.exe
; and its DPAPI-encrypted device token are still on disk: deregisters this device from the backend
; (deletes its Device row + tokens — see apps/backend/src/public-api/public-api.controller.ts's
; DELETE /public/devices/me) and applies an ExtensionInstallBlocklist policy that force-uninstalls
; the Chrome extension regardless of whether it's here via our own force-install or a separate
; manual Chrome Web Store install (see apps/agent/src/lib/chrome-policy.ts's forceRemoveExtension).
; Best-effort/never fails the uninstall — see apps/agent/src/main.ts's runUninstallOnce.
Filename: "{app}\saverlly-agent.exe"; Parameters: "--uninstall-once"; Flags: runhidden; RunOnceId: "AgentUninstallCleanup"
; Mirrors the exact manual removal steps hand-verified earlier in this project's development —
; reg delete on a key that's already gone is a no-op, not an error, same as chrome-policy.ts's
; own self-healing writes treat it.
Filename: "{sys}\schtasks.exe"; Parameters: "/delete /tn ""SaverllyKioskAgent"" /f"; Flags: runhidden; RunOnceId: "RemoveScheduledTask"
; The per-user announcement-overlay relay task (apps/agent/src/lib/overlay.ts) — created/recreated
; on demand whenever an announcement actually needs to be shown, so it may not exist yet on a
; freshly installed machine; schtasks /delete on a missing task is a no-op, not an error.
Filename: "{sys}\schtasks.exe"; Parameters: "/delete /tn ""SaverllyAnnouncementOverlay"" /f"; Flags: runhidden; RunOnceId: "RemoveAnnouncementOverlayTask"
Filename: "{sys}\reg.exe"; Parameters: "delete ""HKLM\SOFTWARE\Google\Chrome\NativeMessagingHosts\com.saverlly.agent"" /f"; Flags: runhidden; RunOnceId: "RemoveNativeMessagingHost"

[UninstallDelete]
Type: filesandordirs; Name: "{commonappdata}\KioskAgent"
