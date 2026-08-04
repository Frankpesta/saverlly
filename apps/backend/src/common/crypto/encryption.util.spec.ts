import { randomBytes } from 'crypto';
import { decrypt, encrypt } from './encryption.util';

describe('encryption util (AES-256-GCM)', () => {
  const originalKey = process.env.ENCRYPTION_KEY;

  beforeAll(() => {
    process.env.ENCRYPTION_KEY = randomBytes(32).toString('base64');
  });

  afterAll(() => {
    process.env.ENCRYPTION_KEY = originalKey;
  });

  it('decrypts back to the original plaintext', () => {
    const plaintext = JSON.stringify({ apiKey: 'super-secret-value', secret: 'shh' });
    expect(decrypt(encrypt(plaintext))).toBe(plaintext);
  });

  it('produces different ciphertext for the same plaintext each time (random IV)', () => {
    const plaintext = 'same input';
    expect(encrypt(plaintext)).not.toBe(encrypt(plaintext));
  });

  it('never leaks the plaintext in the ciphertext output', () => {
    const plaintext = 'a-very-identifiable-secret-string';
    expect(encrypt(plaintext)).not.toContain(plaintext);
  });

  it('throws if the auth tag does not match (tampered ciphertext)', () => {
    const encoded = encrypt('some value');
    const tampered = Buffer.from(encoded, 'base64');
    tampered[tampered.length - 1] ^= 0xff; // flip a byte in the ciphertext
    expect(() => decrypt(tampered.toString('base64'))).toThrow();
  });

  it('throws when ENCRYPTION_KEY is not set', () => {
    delete process.env.ENCRYPTION_KEY;
    expect(() => encrypt('x')).toThrow('ENCRYPTION_KEY is not set');
    process.env.ENCRYPTION_KEY = randomBytes(32).toString('base64');
  });
});
