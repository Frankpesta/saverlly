import { randomInt } from 'crypto';

// Unambiguous charset. Excludes 0/O, 1/I/L to avoid transcription errors when a
// kiosk owner reads a code aloud or types it in on a fresh machine during setup.
const CHARSET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;

export function generateSetupCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CHARSET[randomInt(CHARSET.length)];
  }
  return code;
}
