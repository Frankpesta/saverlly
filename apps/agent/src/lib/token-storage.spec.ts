import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { clearDeviceToken, loadDeviceToken, saveDeviceToken } from './token-storage';

const PS_TEST_TIMEOUT_MS = 15_000;

describe('token-storage', () => {
  let tmpDir: string;
  let filePath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'saverlly-agent-token-'));
    filePath = path.join(tmpDir, 'nested', 'token.enc');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it(
    'returns null when no token has been saved',
    () => {
      expect(loadDeviceToken(filePath)).toBeNull();
    },
    PS_TEST_TIMEOUT_MS,
  );

  it(
    'saves and loads a token round-trip, storing only ciphertext on disk',
    () => {
      saveDeviceToken('real-device-token-123', filePath);
      const onDisk = fs.readFileSync(filePath, 'utf8');
      expect(onDisk).not.toContain('real-device-token-123');
      expect(loadDeviceToken(filePath)).toBe('real-device-token-123');
    },
    PS_TEST_TIMEOUT_MS,
  );

  it(
    'clearDeviceToken removes the file so loadDeviceToken goes back to null',
    () => {
      saveDeviceToken('token-to-clear', filePath);
      clearDeviceToken(filePath);
      expect(fs.existsSync(filePath)).toBe(false);
      expect(loadDeviceToken(filePath)).toBeNull();
    },
    PS_TEST_TIMEOUT_MS,
  );

  it(
    'clearDeviceToken on a non-existent file is a no-op, not a throw',
    () => {
      expect(() => clearDeviceToken(filePath)).not.toThrow();
    },
    PS_TEST_TIMEOUT_MS,
  );

  it(
    'loadDeviceToken returns null (not throw) for a corrupt/undecryptable file',
    () => {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, 'not-real-dpapi-ciphertext', 'utf8');
      expect(loadDeviceToken(filePath)).toBeNull();
    },
    PS_TEST_TIMEOUT_MS,
  );
});
