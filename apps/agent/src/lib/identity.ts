import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { deviceIdentityFilePath } from './paths';

interface DeviceIdentity {
  deviceIdentifier: string;
  createdAt: string;
}

function isDeviceIdentity(value: unknown): value is DeviceIdentity {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as DeviceIdentity).deviceIdentifier === 'string' &&
    (value as DeviceIdentity).deviceIdentifier.length > 0
  );
}

/**
 * Returns this machine's stable local device identifier, creating it on first run.
 * Deliberately not derived from the Windows machine GUID, since that can be reset by
 * imaging tools. This UUID is the agent's own durable identity, persisted only in
 * %PROGRAMDATA%/KioskAgent/device.json (wiped only by a full machine reimage).
 */
export function getOrCreateDeviceIdentifier(filePath: string = deviceIdentityFilePath()): string {
  if (fs.existsSync(filePath)) {
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      const parsed: unknown = JSON.parse(raw);
      if (isDeviceIdentity(parsed)) {
        return parsed.deviceIdentifier;
      }
    } catch {
      // Corrupt/unrecognized file. Fall through and regenerate rather than crash-looping
      // forever on an unattended kiosk machine. Worst case this creates one extra Device
      // record on next registration, which is recoverable; a permanent startup crash isn't.
    }
  }

  const identity: DeviceIdentity = {
    deviceIdentifier: randomUUID(),
    createdAt: new Date().toISOString(),
  };
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(identity, null, 2), 'utf8');
  return identity.deviceIdentifier;
}
