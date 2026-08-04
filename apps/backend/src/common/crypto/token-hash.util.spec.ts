import { hashToken, tokenMatchesHash } from './token-hash.util';

describe('token-hash util', () => {
  it('produces a deterministic hash for the same token', () => {
    const token = 'some-high-entropy-token';
    expect(hashToken(token)).toBe(hashToken(token));
  });

  it('produces different hashes for different tokens', () => {
    expect(hashToken('token-a')).not.toBe(hashToken('token-b'));
  });

  it('matches a token against its own hash', () => {
    const token = 'a-refresh-token';
    expect(tokenMatchesHash(token, hashToken(token))).toBe(true);
  });

  it('rejects a token against a different hash', () => {
    expect(tokenMatchesHash('wrong-token', hashToken('right-token'))).toBe(false);
  });

  it('does not truncate at 72 bytes the way bcrypt would (handles long JWTs)', () => {
    const longToken = 'x'.repeat(500);
    const almostSameToken = 'x'.repeat(499) + 'y';
    expect(hashToken(longToken)).not.toBe(hashToken(almostSameToken));
  });
});
