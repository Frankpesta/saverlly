import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { getOrCreateDeviceIdentifier } from './identity';

describe('getOrCreateDeviceIdentifier', () => {
  let tmpDir: string;
  let filePath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'saverlly-agent-identity-'));
    filePath = path.join(tmpDir, 'nested', 'device.json');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates the file (and any missing parent dirs) with a fresh UUID on first run', () => {
    const id = getOrCreateDeviceIdentifier(filePath);
    expect(id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it('returns the same identifier on every subsequent call', () => {
    const first = getOrCreateDeviceIdentifier(filePath);
    const second = getOrCreateDeviceIdentifier(filePath);
    expect(second).toBe(first);
  });

  it('regenerates rather than crashing if the file is corrupt JSON', () => {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, '{ not valid json', 'utf8');

    const id = getOrCreateDeviceIdentifier(filePath);
    expect(id).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it('regenerates rather than reusing a file missing the expected shape', () => {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify({ somethingElse: true }), 'utf8');

    const id = getOrCreateDeviceIdentifier(filePath);
    expect(id).toMatch(/^[0-9a-f-]{36}$/i);
  });
});
