import * as os from 'os';
import { deregisterDevice } from './lib/api-client';
import { pollAndDisplayAnnouncements } from './lib/announcements';
import { CHROME_WEB_STORE_UPDATE_URL, forceRemoveExtension } from './lib/chrome-policy';
import { ANNOUNCEMENT_POLL_INTERVAL_MS, STATUS_SYNC_INTERVAL_MS } from './lib/config';
import { isUninstallOnce, parseInstallerSetupArgs } from './lib/installer-mode';
import { isNativeMessagingInvocation, respondWithDeviceToken } from './lib/native-host-mode';
import { nativeMessagingHostExePath } from './lib/native-messaging-host';
import { ensureRegistered } from './lib/registration';
import { ensureRunAtLoginTask } from './lib/run-at-login';
import { runStatusSync } from './lib/status-sync';
import { loadDeviceToken } from './lib/token-storage';

// In a real packaged exe these two process.env reads are almost always already resolved to
// literal strings by scripts/build.js's esbuild `define` — see that file for why a runtime
// env var isn't a workable config story for something a kiosk owner downloads and runs.
function getExtensionId(): string {
  const id = process.env.SAVERLLY_EXTENSION_ID;
  if (!id) {
    throw new Error(
      'SAVERLLY_EXTENSION_ID must be set to the Chrome Web Store (or self-hosted) extension id to force-install',
    );
  }
  return id;
}

function getUpdateUrl(): string {
  return process.env.SAVERLLY_EXTENSION_UPDATE_URL || CHROME_WEB_STORE_UPDATE_URL;
}

async function runSyncCycle(
  token: string,
  policyOptions: { extensionId: string; updateUrl: string; exePath: string },
): Promise<void> {
  const active = await runStatusSync(token, policyOptions);
  if (active) {
    await pollAndDisplayAnnouncements(token);
  }
}

interface AgentStartupState {
  token: string;
  policyOptions: { extensionId: string; updateUrl: string; exePath: string };
}

// The registration/scheduled-task/policy setup shared by both the always-on background agent
// (runBackgroundAgent) and the installer's one-shot setup run (runSetupOnce) — factored out so
// the two only differ in whether they loop afterward, not in what setup actually does.
async function performInitialSetup(): Promise<AgentStartupState> {
  const extensionId = getExtensionId();
  const updateUrl = getUpdateUrl();
  const exePath = process.execPath;

  console.log(`[saverlly-agent] starting on ${os.hostname()}`);

  const token = await ensureRegistered();
  console.log('[saverlly-agent] device registered/token ready');

  // Best-effort — a failure here (e.g. not currently elevated) must not stop the rest of
  // startup: status-sync/announcements/native-messaging can all still work this run, and
  // ensureRunAtLoginTask is idempotent so it'll simply retry on the next actual restart.
  try {
    ensureRunAtLoginTask(exePath);
  } catch (err) {
    console.error('[saverlly-agent] failed to register the run-at-login scheduled task', err);
  }

  // The native-messaging manifest must point at the sibling non-elevated host exe, not this
  // (requireAdministrator) one — see native-messaging-host.ts's nativeMessagingHostExePath doc.
  const policyOptions = { extensionId, updateUrl, exePath: nativeMessagingHostExePath(exePath) };
  await runSyncCycle(token, policyOptions);

  return { token, policyOptions };
}

async function runBackgroundAgent(): Promise<void> {
  const { token, policyOptions } = await performInitialSetup();

  // Cadences happen to match today, but are configured independently (config.ts) — running
  // one combined interval at their minimum keeps both promises without double-scheduling.
  const intervalMs = Math.min(STATUS_SYNC_INTERVAL_MS, ANNOUNCEMENT_POLL_INTERVAL_MS);
  setInterval(() => {
    runSyncCycle(token, policyOptions).catch((err) => {
      console.error('[saverlly-agent] sync cycle failed', err);
    });
  }, intervalMs);
}

// Invoked by the GUI installer (apps/agent/installer/) via `--setup-once`: runs the exact same
// setup as runBackgroundAgent's first pass, then actually returns — deliberately no
// setInterval — so the installer's Exec call gets a real exit code (0 = success, nonzero via
// the top-level catch below on failure) instead of hanging on a loop meant for the persistent
// background agent, which the scheduled task this same setup registers will handle from here.
async function runSetupOnce(): Promise<void> {
  await performInitialSetup();
  console.log('[saverlly-agent] setup complete');
}

// Invoked by the GUI installer's [UninstallRun] step via `--uninstall-once`, while the agent's
// files and DPAPI-encrypted device token are still on disk. Best-effort and never throws — a
// kiosk machine can be decommissioned offline, and either step failing must not block the rest
// of the uninstaller (scheduled task / native-messaging-host / ProgramData cleanup) from running.
async function runUninstallOnce(): Promise<void> {
  const token = loadDeviceToken();
  if (token) {
    try {
      await deregisterDevice(token);
      console.log('[saverlly-agent] device deregistered from backend');
    } catch (err) {
      console.error('[saverlly-agent] device deregistration failed (continuing uninstall)', err);
    }
  }

  try {
    forceRemoveExtension(getExtensionId());
    console.log('[saverlly-agent] extension force-removal policy applied');
  } catch (err) {
    console.error('[saverlly-agent] failed to apply extension force-removal policy', err);
  }
}

async function main(): Promise<void> {
  if (isUninstallOnce(process.argv)) {
    await runUninstallOnce();
    return;
  }

  const installerArgs = parseInstallerSetupArgs(process.argv);
  if (installerArgs) {
    // The installer collects the setup code via its own GUI page, not the interactive console
    // prompt promptForSetupCode() falls back to — bridge it into the env var that already
    // expects, so registration.ts needs zero changes for this new invocation mode.
    if (installerArgs.setupCode) process.env.SAVERLLY_SETUP_CODE = installerArgs.setupCode;
    await runSetupOnce();
    return;
  }

  // Chrome spawns this same exe fresh (with a chrome-extension:// origin arg) whenever the
  // extension calls connectNative — that invocation must respond and exit, not fall through
  // into the long-running background-agent startup below.
  if (isNativeMessagingInvocation(process.argv)) {
    respondWithDeviceToken();
    return;
  }

  await runBackgroundAgent();
}

main().catch((err) => {
  console.error('[saverlly-agent] fatal startup error', err);
  process.exit(1);
});
