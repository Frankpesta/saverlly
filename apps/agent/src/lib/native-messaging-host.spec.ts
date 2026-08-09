import { execFileSync } from 'child_process';
import * as fs from 'fs';
import { ensureNativeMessagingHostRegistered, NATIVE_HOST_NAME } from './native-messaging-host';

jest.mock('child_process');
jest.mock('fs');

const mockExecFileSync = execFileSync as jest.MockedFunction<typeof execFileSync>;
const mockWriteFileSync = fs.writeFileSync as jest.MockedFunction<typeof fs.writeFileSync>;
const mockMkdirSync = fs.mkdirSync as jest.MockedFunction<typeof fs.mkdirSync>;

describe('ensureNativeMessagingHostRegistered', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('throws without touching disk or the registry when extensionId is missing', () => {
    expect(() => ensureNativeMessagingHostRegistered('', 'C:\\agent.exe')).toThrow(/extensionId/);
    expect(mockWriteFileSync).not.toHaveBeenCalled();
    expect(mockExecFileSync).not.toHaveBeenCalled();
  });

  it('writes a manifest whose allowed_origins matches the given extension id, and points at the exe path', () => {
    ensureNativeMessagingHostRegistered('myextid123', 'C:\\Program Files\\Saverlly\\agent.exe', {
      manifestPath: 'C:\\ProgramData\\KioskAgent\\native-messaging-host.json',
    });

    expect(mockMkdirSync).toHaveBeenCalled();
    const [writtenPath, writtenContent] = mockWriteFileSync.mock.calls[0];
    expect(writtenPath).toBe('C:\\ProgramData\\KioskAgent\\native-messaging-host.json');
    const manifest = JSON.parse(writtenContent as string);
    expect(manifest).toMatchObject({
      name: NATIVE_HOST_NAME,
      path: 'C:\\Program Files\\Saverlly\\agent.exe',
      type: 'stdio',
      allowed_origins: ['chrome-extension://myextid123/'],
    });
  });

  it('registers the manifest path under the (default) value of the native messaging hosts registry key', () => {
    ensureNativeMessagingHostRegistered('myextid123', 'C:\\agent.exe', {
      registryKey: 'HKLM\\TEST\\NativeMessagingHosts\\com.saverlly.agent',
      manifestPath: 'C:\\test\\manifest.json',
    });

    expect(mockExecFileSync).toHaveBeenCalledWith(
      'reg',
      ['add', 'HKLM\\TEST\\NativeMessagingHosts\\com.saverlly.agent', '/ve', '/t', 'REG_SZ', '/d', 'C:\\test\\manifest.json', '/f'],
      { stdio: 'ignore' },
    );
  });
});
