import { isUninstallOnce, parseInstallerSetupArgs } from './installer-mode';

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

describe('isUninstallOnce', () => {
  it('is false for normal background-agent startup', () => {
    expect(isUninstallOnce(['exe.exe'])).toBe(false);
  });

  it('is false for --setup-once (the opposite lifecycle end)', () => {
    expect(isUninstallOnce(['exe.exe', '--setup-once', '--setup-code=ABC123'])).toBe(false);
  });

  it('is true when --uninstall-once is present, as passed by [UninstallRun]', () => {
    expect(isUninstallOnce(['exe.exe', '--uninstall-once'])).toBe(true);
  });
});
