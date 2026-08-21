; Saverlly Kiosk Agent installer.
;
; Replaces the previous "download a zip, extract two exes manually, double-click one, type a
; setup code into a console window" flow with a single branded installer: one UAC prompt (the
; normal ShellExecute-based prompt Explorer shows for a manifest-tagged exe on double-click —
; NOT the same non-elevating launch path that broke Chrome's native-messaging spawn earlier),
; one wizard page asking for the setup code, then done. See apps/agent/scripts/package.js for
; how this gets compiled (ISCC) as part of `npm run package`.
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

[Code]
var
  SetupCodePage: TInputQueryWizardPage;
  AgentSetupSucceeded: Boolean;
  AgentSetupResultCode: Integer;

procedure InitializeWizard;
begin
  SetupCodePage := CreateInputQueryPage(wpWelcome,
    'Connect Your Location',
    'Enter your Saverlly setup code',
    'You''ll find this in your welcome email, or you can ask your Saverlly admin for it.');
  SetupCodePage.Add('Setup code:', False);
end;

function NextButtonClick(CurPageID: Integer): Boolean;
begin
  Result := True;
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
; Mirrors the exact manual removal steps hand-verified earlier in this project's development —
; reg delete on a key that's already gone is a no-op, not an error, same as chrome-policy.ts's
; own self-healing writes treat it.
Filename: "{sys}\schtasks.exe"; Parameters: "/delete /tn ""SaverllyKioskAgent"" /f"; Flags: runhidden; RunOnceId: "RemoveScheduledTask"
Filename: "{sys}\reg.exe"; Parameters: "delete ""HKLM\SOFTWARE\Policies\Google\Chrome\ExtensionInstallForcelist"" /f"; Flags: runhidden; RunOnceId: "RemoveForcelist"
Filename: "{sys}\reg.exe"; Parameters: "delete ""HKLM\SOFTWARE\Policies\Google\Chrome\ExtensionInstallAllowlist"" /f"; Flags: runhidden; RunOnceId: "RemoveAllowlist"
Filename: "{sys}\reg.exe"; Parameters: "delete ""HKLM\SOFTWARE\Google\Chrome\NativeMessagingHosts\com.saverlly.agent"" /f"; Flags: runhidden; RunOnceId: "RemoveNativeMessagingHost"

[UninstallDelete]
Type: filesandordirs; Name: "{commonappdata}\KioskAgent"
