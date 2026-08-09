import { KioskStatus } from '@saverlly/shared-types';
import { isAgentActive, writeAgentActiveState } from './agent-status';
import { fetchDeviceStatus } from './api-client';
import { applyChromeForceInstallPolicy } from './chrome-policy';
import { ensureNativeMessagingHostRegistered } from './native-messaging-host';
import { runStatusSync } from './status-sync';

jest.mock('./agent-status');
jest.mock('./api-client');
jest.mock('./chrome-policy');
jest.mock('./native-messaging-host');

const mockIsAgentActive = isAgentActive as jest.MockedFunction<typeof isAgentActive>;
const mockWriteAgentActiveState = writeAgentActiveState as jest.MockedFunction<typeof writeAgentActiveState>;
const mockFetchDeviceStatus = fetchDeviceStatus as jest.MockedFunction<typeof fetchDeviceStatus>;
const mockApplyPolicy = applyChromeForceInstallPolicy as jest.MockedFunction<typeof applyChromeForceInstallPolicy>;
const mockEnsureNativeHost = ensureNativeMessagingHostRegistered as jest.MockedFunction<
  typeof ensureNativeMessagingHostRegistered
>;

const OPTIONS = { extensionId: 'ext-id-123', updateUrl: 'https://update.example.com', exePath: 'C:\\agent.exe' };

describe('runStatusSync', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockIsAgentActive.mockReturnValue(true);
  });

  it('returns true and persists active=true when kiosk ACTIVE and device active', async () => {
    mockFetchDeviceStatus.mockResolvedValue({ kioskStatus: KioskStatus.ACTIVE, deviceActive: true });

    const result = await runStatusSync('tok', OPTIONS);

    expect(result).toBe(true);
    expect(mockWriteAgentActiveState).toHaveBeenCalledWith(true);
  });

  it('returns false when kiosk is INACTIVE, even if the device itself is active', async () => {
    mockFetchDeviceStatus.mockResolvedValue({ kioskStatus: KioskStatus.INACTIVE, deviceActive: true });

    expect(await runStatusSync('tok', OPTIONS)).toBe(false);
    expect(mockWriteAgentActiveState).toHaveBeenCalledWith(false);
  });

  it('returns false when the device itself is disabled (kill-switch), even if kiosk is ACTIVE', async () => {
    mockFetchDeviceStatus.mockResolvedValue({ kioskStatus: KioskStatus.ACTIVE, deviceActive: false });

    expect(await runStatusSync('tok', OPTIONS)).toBe(false);
  });

  it('fails closed (false) on a network/API error, not "on"', async () => {
    mockFetchDeviceStatus.mockRejectedValue(new Error('network down'));

    expect(await runStatusSync('tok', OPTIONS)).toBe(false);
    expect(mockWriteAgentActiveState).toHaveBeenCalledWith(false);
  });

  it('re-asserts both self-healing Chrome policies on every cycle, active or not', async () => {
    mockFetchDeviceStatus.mockResolvedValue({ kioskStatus: KioskStatus.INACTIVE, deviceActive: false });

    await runStatusSync('tok', OPTIONS);

    expect(mockApplyPolicy).toHaveBeenCalledWith(OPTIONS.extensionId, OPTIONS.updateUrl);
    expect(mockEnsureNativeHost).toHaveBeenCalledWith(OPTIONS.extensionId, OPTIONS.exePath);
  });

  it('still returns the correct active state even when both self-healing registrations fail (e.g. not elevated)', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockFetchDeviceStatus.mockResolvedValue({ kioskStatus: KioskStatus.ACTIVE, deviceActive: true });
    mockApplyPolicy.mockImplementation(() => {
      throw new Error('Access is denied.');
    });
    mockEnsureNativeHost.mockImplementation(() => {
      throw new Error('Access is denied.');
    });

    await expect(runStatusSync('tok', OPTIONS)).resolves.toBe(true);
    expect(errorSpy).toHaveBeenCalledTimes(2);
    errorSpy.mockRestore();
  });

  it('still attempts native-messaging-host registration even when the Chrome policy write fails first', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockFetchDeviceStatus.mockResolvedValue({ kioskStatus: KioskStatus.ACTIVE, deviceActive: true });
    mockApplyPolicy.mockImplementation(() => {
      throw new Error('Access is denied.');
    });

    await runStatusSync('tok', OPTIONS);

    expect(mockEnsureNativeHost).toHaveBeenCalled();
  });

  it('logs a warning only on the active->inactive transition, not on every inactive cycle', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockFetchDeviceStatus.mockResolvedValue({ kioskStatus: KioskStatus.INACTIVE, deviceActive: false });

    mockIsAgentActive.mockReturnValue(true); // was active before this cycle
    await runStatusSync('tok', OPTIONS);
    expect(warnSpy).toHaveBeenCalledTimes(1);

    mockIsAgentActive.mockReturnValue(false); // already inactive from the previous cycle
    await runStatusSync('tok', OPTIONS);
    expect(warnSpy).toHaveBeenCalledTimes(1); // no additional warning

    warnSpy.mockRestore();
  });
});
