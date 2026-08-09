import { dpapiProtect, dpapiUnprotect } from './dpapi';

// These shell out to the real Windows DPAPI via PowerShell — legitimate here since the
// whole agent is Windows-only (per 04-PHASE-4-desktop-agent.md), unlike the extension's
// DOM-interaction logic which genuinely can't run headlessly in CI. Each PowerShell
// launch is slow-ish, so give these a longer-than-default timeout.
const PS_TEST_TIMEOUT_MS = 15_000;

describe('dpapi', () => {
  it(
    'round-trips a plaintext string through Protect/Unprotect',
    () => {
      const plainText = 'device-token-' + Math.random().toString(36).slice(2);
      const encrypted = dpapiProtect(plainText);
      expect(encrypted).not.toContain(plainText);
      expect(dpapiUnprotect(encrypted)).toBe(plainText);
    },
    PS_TEST_TIMEOUT_MS,
  );

  it(
    'produces ciphertext that does not resemble the plaintext',
    () => {
      const encrypted = dpapiProtect('super-secret-value');
      expect(encrypted).toMatch(/^[A-Za-z0-9+/=]+$/);
    },
    PS_TEST_TIMEOUT_MS,
  );

  it(
    'throws when unprotecting garbage input',
    () => {
      expect(() => dpapiUnprotect('not-valid-base64-ciphertext')).toThrow();
    },
    PS_TEST_TIMEOUT_MS,
  );

  it(
    'round-trips unicode content correctly',
    () => {
      const plainText = 'tökén-with-ünïcode-🔑';
      const encrypted = dpapiProtect(plainText);
      expect(dpapiUnprotect(encrypted)).toBe(plainText);
    },
    PS_TEST_TIMEOUT_MS,
  );
});
