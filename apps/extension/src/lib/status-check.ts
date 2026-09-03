import { AuthError, fetchDeviceStatus } from './api-client';
import { STATUS_GRACE_PERIOD_MS } from './config';
import { getLastStatusOkAt, isDormant, setDormant, setLastStatusOkAt } from './storage';

export function isWithinGracePeriod(lastOkAt: number | null, now: number): boolean {
  if (lastOkAt === null) return false;
  return now - lastOkAt <= STATUS_GRACE_PERIOD_MS;
}

/**
 * Polls the device/kiosk status and updates the dormant flag. Returns whether the
 * extension should currently be considered active (not dormant).
 */
export async function checkDeviceStatus(now: number = Date.now()): Promise<boolean> {
  try {
    const status = await fetchDeviceStatus();
    const active = status.kioskStatus === 'ACTIVE' && status.deviceActive;
    await setDormant(!active);
    if (active) {
      await setLastStatusOkAt(now);
    }
    return active;
  } catch (err) {
    if (err instanceof AuthError) {
      // apiFetch already flipped dormant=true on 401/403. No token, kill-switched
      // device, or inactive kiosk. No grace period for an explicit auth rejection.
      return false;
    }

    // Network/unexpected failure. Ride on the last confirmed-good status for a
    // short grace window rather than immediately going dormant on a blip.
    const lastOkAt = await getLastStatusOkAt();
    if (isWithinGracePeriod(lastOkAt, now)) {
      return !(await isDormant());
    }
    await setDormant(true);
    return false;
  }
}
