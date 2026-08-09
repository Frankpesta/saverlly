import * as fs from 'fs';
import * as path from 'path';
import { dpapiProtect, dpapiUnprotect } from './dpapi';
import { tokenFilePath } from './paths';

export function saveDeviceToken(token: string, filePath: string = tokenFilePath()): void {
  const encrypted = dpapiProtect(token);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, encrypted, 'utf8');
}

/** Returns null if no token file exists, or if it exists but can't be decrypted (corrupt/foreign-machine). */
export function loadDeviceToken(filePath: string = tokenFilePath()): string | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    const encrypted = fs.readFileSync(filePath, 'utf8');
    return dpapiUnprotect(encrypted);
  } catch {
    return null;
  }
}

export function clearDeviceToken(filePath: string = tokenFilePath()): void {
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}
