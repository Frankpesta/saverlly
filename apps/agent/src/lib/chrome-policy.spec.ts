import { execFileSync } from 'child_process';
import { applyChromeForceInstallPolicy, forceRemoveExtension, readListPolicy } from './chrome-policy';

jest.mock('child_process');
const mockExecFileSync = execFileSync as jest.MockedFunction<typeof execFileSync>;

describe('applyChromeForceInstallPolicy', () => {
  beforeEach(() => {
    mockExecFileSync.mockReset();
    mockExecFileSync.mockReturnValue('' as never);
  });

  it('throws without shelling out at all when extensionId is missing', () => {
    expect(() => applyChromeForceInstallPolicy('', 'https://update.example.com')).toThrow(/extensionId/);
    expect(mockExecFileSync).not.toHaveBeenCalled();
  });

  it('deletes then re-adds both the Forcelist and Allowlist keys, in that order', () => {
    applyChromeForceInstallPolicy('abc123', 'https://update.example.com', { keyBase: 'HKLM\\TEST\\Chrome' });

    const calls = mockExecFileSync.mock.calls.map(([, args]) => args);
    expect(calls).toEqual([
      ['delete', 'HKLM\\TEST\\Chrome\\ExtensionInstallForcelist', '/f'],
      [
        'add',
        'HKLM\\TEST\\Chrome\\ExtensionInstallForcelist',
        '/v',
        '1',
        '/t',
        'REG_SZ',
        '/d',
        'abc123;https://update.example.com',
        '/f',
      ],
      ['delete', 'HKLM\\TEST\\Chrome\\ExtensionInstallAllowlist', '/f'],
      ['add', 'HKLM\\TEST\\Chrome\\ExtensionInstallAllowlist', '/v', '1', '/t', 'REG_SZ', '/d', 'abc123', '/f'],
    ]);
  });

  it('defaults to the real Chrome enterprise policy registry path when no keyBase override is given', () => {
    applyChromeForceInstallPolicy('abc123', 'https://update.example.com');

    const [, addArgs] = mockExecFileSync.mock.calls[1];
    expect(addArgs?.[1]).toBe('HKLM\\SOFTWARE\\Policies\\Google\\Chrome\\ExtensionInstallForcelist');
  });

  it('does not let a failed "delete" (key not found) abort the following "add"', () => {
    mockExecFileSync.mockImplementationOnce(() => {
      throw new Error('key not found');
    });

    expect(() => applyChromeForceInstallPolicy('abc123', 'https://update.example.com')).not.toThrow();
    expect(mockExecFileSync).toHaveBeenCalledTimes(4);
  });
});

describe('forceRemoveExtension', () => {
  beforeEach(() => {
    mockExecFileSync.mockReset();
    mockExecFileSync.mockReturnValue('' as never);
  });

  it('throws without shelling out at all when extensionId is missing', () => {
    expect(() => forceRemoveExtension('')).toThrow(/extensionId/);
    expect(mockExecFileSync).not.toHaveBeenCalled();
  });

  it('blocklists the extension, then deletes the Forcelist and Allowlist keys', () => {
    forceRemoveExtension('abc123', { keyBase: 'HKLM\\TEST\\Chrome' });

    const calls = mockExecFileSync.mock.calls.map(([, args]) => args);
    expect(calls).toEqual([
      ['delete', 'HKLM\\TEST\\Chrome\\ExtensionInstallBlocklist', '/f'],
      ['add', 'HKLM\\TEST\\Chrome\\ExtensionInstallBlocklist', '/v', '1', '/t', 'REG_SZ', '/d', 'abc123', '/f'],
      ['delete', 'HKLM\\TEST\\Chrome\\ExtensionInstallForcelist', '/f'],
      ['delete', 'HKLM\\TEST\\Chrome\\ExtensionInstallAllowlist', '/f'],
    ]);
  });

  it('does not let a failed Forcelist/Allowlist delete (key not found) throw', () => {
    mockExecFileSync
      .mockReturnValueOnce('' as never)
      .mockReturnValueOnce('' as never)
      .mockImplementationOnce(() => {
        throw new Error('key not found');
      });

    expect(() => forceRemoveExtension('abc123', { keyBase: 'HKLM\\TEST\\Chrome' })).not.toThrow();
  });
});

describe('readListPolicy', () => {
  beforeEach(() => {
    mockExecFileSync.mockReset();
  });

  it('parses "reg query" output into an ordered list of values', () => {
    mockExecFileSync.mockReturnValue(
      [
        'HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Google\\Chrome\\ExtensionInstallForcelist',
        '    2    REG_SZ    second-value',
        '    1    REG_SZ    first-value',
        '',
      ].join('\r\n') as never,
    );

    expect(readListPolicy('HKLM\\anything')).toEqual(['first-value', 'second-value']);
  });

  it('returns an empty array when the key does not exist', () => {
    mockExecFileSync.mockImplementationOnce(() => {
      throw new Error('ERROR: The system was unable to find the specified registry key.');
    });

    expect(readListPolicy('HKLM\\missing')).toEqual([]);
  });
});
