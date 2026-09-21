jest.mock('./lib/api-client', () => ({}));
jest.mock('./lib/announcements', () => ({
  pollAndDisplayAnnouncements: jest.fn(),
}));
jest.mock('./lib/chrome-policy', () => ({}));
jest.mock('./lib/installer-mode', () => ({
  isUninstallOnce: () => false,
  parseInstallerSetupArgs: jest.fn(),
}));
jest.mock('./lib/native-host-mode', () => ({
  isNativeMessagingInvocation: () => false,
}));
jest.mock('./lib/native-messaging-host', () => ({
  nativeMessagingHostExePath: () => 'host.exe',
}));
jest.mock('./lib/registration', () => ({
  ensureRegistered: async () => 'token',
}));
jest.mock('./lib/run-at-login', () => ({
  ensureRunAtLoginTask: jest.fn(),
  startRunAtLoginTask: jest.fn(),
}));
jest.mock('./lib/status-sync', () => ({ runStatusSync: jest.fn() }));
jest.mock('./lib/token-storage', () => ({}));

import { pollAndDisplayAnnouncements } from './lib/announcements';
import { parseInstallerSetupArgs } from './lib/installer-mode';
import { startRunAtLoginTask } from './lib/run-at-login';
import { runStatusSync } from './lib/status-sync';

describe('agent startup recovery', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    process.env.SAVERLLY_EXTENSION_ID = 'test-extension';
    jest.mocked(runStatusSync).mockResolvedValue(true);
    jest.mocked(pollAndDisplayAnnouncements).mockRejectedValue(new Error('Temporary API failure'));
    jest.mocked(parseInstallerSetupArgs).mockReturnValue(null);
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  it('keeps polling when the first announcement request fails', async () => {
    const exit = jest.spyOn(process, 'exit').mockImplementation((() => {}) as never);
    jest.isolateModules(() => require('./main'));
    await jest.advanceTimersByTimeAsync(61000);
    expect(runStatusSync).toHaveBeenCalledTimes(2);
    expect(exit).not.toHaveBeenCalled();
  });
  it('starts the background task on setup without waiting for another login', async () => {
    jest.mocked(parseInstallerSetupArgs).mockReturnValue({ setupCode: 'TEST' });
    jest.isolateModules(() => require('./main'));
    await jest.advanceTimersByTimeAsync(1);
    expect(startRunAtLoginTask).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  });
});
