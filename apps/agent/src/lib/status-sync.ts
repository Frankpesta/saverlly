import { isAgentActive, writeAgentActiveState } from './agent-status';
import { fetchDeviceStatus } from './api-client';
import { applyChromeForceInstallPolicy } from './chrome-policy';
import { ensureNativeMessagingHostRegistered } from './native-messaging-host';

export interface StatusSyncOptions {
  extensionId: string;
  updateUrl: string;
  exePath: string;
}

/**
 * One periodic-sync cycle (call every STATUS_SYNC_INTERVAL_MS): re-checks kiosk/device
 * status, updates the locally-persisted active flag that native-host-mode consults before
 * handing out the token, and unconditionally re-asserts both self-healing Chrome policies —
 * see 04-PHASE-4-desktop-agent.md §5. Returns the new active state.
 */
export async function runStatusSync(token: string, options: StatusSyncOptions): Promise<boolean> {
  const wasActive = isAgentActive();

  let active: boolean;
  try {
    const status = await fetchDeviceStatus(token);
    active = status.kioskStatus === 'ACTIVE' && status.deviceActive;
  } catch {
    // Network/API failure — fail closed rather than assume "on", per the platform-wide
    // fail-safe rule (00-PROJECT-OVERVIEW.md §4). See agent-status.ts for why no grace period.
    active = false;
  }

  writeAgentActiveState(active);
  if (wasActive && !active) {
    // Minimal local "troubleshooting" signal per spec §5 — a full persistent tray-icon
    // indicator was left out as genuinely optional scope; this at least makes the state
    // change visible in the agent's own console/log output.
    console.warn('[saverlly-agent] Device/kiosk is now inactive — no longer serving the device token.');
  }

  // Each self-healing registration is independent — one failing (e.g. the process isn't
  // elevated enough to write HKLM this cycle) must not stop the other from being retried,
  // and must not fail the whole cycle: status-sync/announcements already succeeded above
  // and that result is still worth keeping.
  try {
    applyChromeForceInstallPolicy(options.extensionId, options.updateUrl);
  } catch (err) {
    console.error('[saverlly-agent] failed to apply Chrome force-install policy this cycle', err);
  }
  try {
    ensureNativeMessagingHostRegistered(options.extensionId, options.exePath);
  } catch (err) {
    console.error('[saverlly-agent] failed to register native messaging host this cycle', err);
  }

  return active;
}
