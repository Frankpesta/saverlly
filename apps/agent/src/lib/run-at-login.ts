import { execFileSync } from 'child_process';

export const RUN_AT_LOGIN_TASK_NAME = 'SaverllyKioskAgent';

export interface RunAtLoginOptions {
  taskName?: string;
}

/** Start the registered SYSTEM task immediately after installation or repair. */
export function startRunAtLoginTask(options: RunAtLoginOptions = {}): void {
  execFileSync('schtasks', ['/run', '/tn', options.taskName ?? RUN_AT_LOGIN_TASK_NAME], {
    stdio: 'ignore',
    windowsHide: true,
  });
}

/**
 * Registers (or re-registers, /f overwrites) a Windows Scheduled Task that launches the
 * agent exe at every user logon, running as SYSTEM so it always has enough privilege to
 * write the HKLM Chrome policy / native-messaging-host keys regardless of which account is
 * actually logged in at the kiosk. Idempotent. Safe to call on every agent startup.
 */
export function ensureRunAtLoginTask(exePath: string, options: RunAtLoginOptions = {}): void {
  const taskName = options.taskName ?? RUN_AT_LOGIN_TASK_NAME;
  execFileSync(
    'schtasks',
    [
      '/create',
      '/tn',
      taskName,
      '/tr',
      `"${exePath}"`,
      '/sc',
      'onlogon',
      '/rl',
      'highest',
      '/ru',
      'SYSTEM',
      '/f',
    ],
    { stdio: 'ignore' },
  );
}
