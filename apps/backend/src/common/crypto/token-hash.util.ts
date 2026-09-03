import { createHash, timingSafeEqual } from 'crypto';

/**
 * For hashing high-entropy opaque tokens (JWTs, device tokens). Not passwords.
 * bcrypt truncates input past 72 bytes, which is unsafe for full-length tokens;
 * SHA-256 has no such limit and tokens already carry enough entropy on their own.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function tokenMatchesHash(token: string, hash: string): boolean {
  const candidate = Buffer.from(hashToken(token), 'hex');
  const stored = Buffer.from(hash, 'hex');
  if (candidate.length !== stored.length) {
    return false;
  }
  return timingSafeEqual(candidate, stored);
}
