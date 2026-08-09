import * as os from 'os';
import { pollAndDisplayAnnouncements } from './lib/announcements';
import { CHROME_WEB_STORE_UPDATE_URL } from './lib/chrome-policy';
import { ANNOUNCEMENT_POLL_INTERVAL_MS, STATUS_SYNC_INTERVAL_MS } from './lib/config';
import { isNativeMessagingInvocation, respondWithDeviceToken } from './lib/native-host-mode';
import { ensureRegistered } from './lib/registration';
import { ensureRunAtLoginTask } from './lib/run-at-login';
import { runStatusSync } from './lib/status-sync';

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

async function runBackgroundAgent(): Promise<void> {
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

  const policyOptions = { extensionId, updateUrl, exePath };
  await runSyncCycle(token, policyOptions);

  // Cadences happen to match today, but are configured independently (config.ts) — running
  // one combined interval at their minimum keeps both promises without double-scheduling.
  const intervalMs = Math.min(STATUS_SYNC_INTERVAL_MS, ANNOUNCEMENT_POLL_INTERVAL_MS);
  setInterval(() => {
    runSyncCycle(token, policyOptions).catch((err) => {
      console.error('[saverlly-agent] sync cycle failed', err);
    });
  }, intervalMs);
}

async function main(): Promise<void> {
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
