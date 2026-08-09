import { randomBytes } from 'crypto';

/**
 * Mints an opaque sub-ID/click-ID value for affiliate network pass-through tracking
 * params (Impact's "SubId1", CJ's "SID", etc). Resolution back to a device happens via
 * an AttributionAttempt DB lookup, not by decoding this string — the device-id prefix
 * here is purely for human debuggability during support triage.
 */
export function generateSubId(deviceId: string): string {
  return `${deviceId.replace(/-/g, '').slice(0, 8)}${randomBytes(8).toString('hex')}`;
}
