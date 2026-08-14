import { randomInt } from 'crypto';

// Unambiguous charset — excludes 0/O, 1/I/l — a human may need to read this off a
// screen and retype it once before the forced change-password flow replaces it.
const CHARSET =
  'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%^&*';
const PASSWORD_LENGTH = 16;

/**
 * Generates a cryptographically random, human-transcribable temporary password for
 * server-generated accounts (kiosk owners, location managers). Never persisted in
 * plaintext — callers must bcrypt.hash it immediately and return the plaintext at
 * most once, in the creation response, for admin display/copy + the welcome email.
 */
export function generatePassword(): string {
  let password = '';
  for (let i = 0; i < PASSWORD_LENGTH; i++) {
    password += CHARSET[randomInt(CHARSET.length)];
  }
  return password;
}
