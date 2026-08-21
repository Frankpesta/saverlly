// The GUI installer (Inno Setup — see apps/agent/installer/) needs the agent to run its
// one-time registration/scheduled-task/policy setup and then actually exit with a real exit
// code, so the installer's Exec call can wait on it and show success/failure — unlike
// runBackgroundAgent's normal behavior, which loops forever via setInterval (see main.ts).
// The installer passes --setup-once (and, since it collects the code via a GUI page rather
// than a console prompt, --setup-code=<value> instead of the SAVERLLY_SETUP_CODE env var
// registration.ts already knows how to read).
export interface InstallerSetupArgs {
  setupCode?: string;
}

export function parseInstallerSetupArgs(argv: string[]): InstallerSetupArgs | null {
  if (!argv.includes('--setup-once')) return null;
  const codeArg = argv.find((arg) => arg.startsWith('--setup-code='));
  return { setupCode: codeArg?.slice('--setup-code='.length) };
}
