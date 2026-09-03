import { randomBytes } from 'crypto';

/**
 * Mints an opaque sub-ID/click-ID value for affiliate network pass-through tracking
 * params (Impact's "SubId1", CJ's "SID", etc). Resolution back to a device happens via
 * an AttributionAttempt DB lookup, not by decoding this string. It must not encode any
 * part of the device id itself, since this value is sent to third-party affiliate
 * networks as a URL parameter and would otherwise leak a partial device identifier to
 * external parties.
 */
export function generateSubId(): string {
  return randomBytes(16).toString('hex');
}
