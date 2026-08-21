import { parseInstallerSetupArgs } from './installer-mode';

describe('parseInstallerSetupArgs', () => {
  it('returns null when --setup-once is not present (normal background-agent startup)', () => {
    expect(parseInstallerSetupArgs(['exe.exe'])).toBeNull();
    expect(parseInstallerSetupArgs(['exe.exe', '--some-other-flag'])).toBeNull();
  });

  it('returns null for a native-messaging invocation, which never passes --setup-once', () => {
    expect(parseInstallerSetupArgs(['exe.exe', 'chrome-extension://abcdefghijklmnop/'])).toBeNull();
  });

  it('detects --setup-once with a setup code attached', () => {
    expect(parseInstallerSetupArgs(['exe.exe', '--setup-once', '--setup-code=ABC123'])).toEqual({
      setupCode: 'ABC123',
    });
  });

  it('detects --setup-once with no setup code (falls back to whatever registration.ts does without one)', () => {
    expect(parseInstallerSetupArgs(['exe.exe', '--setup-once'])).toEqual({ setupCode: undefined });
  });

  it('is order-independent between the two flags', () => {
    expect(parseInstallerSetupArgs(['exe.exe', '--setup-code=XYZ789', '--setup-once'])).toEqual({
      setupCode: 'XYZ789',
    });
  });
});
