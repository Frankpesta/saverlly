import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { isAgentActive, writeAgentActiveState } from './agent-status';

describe('agent-status', () => {
  let tmpDir: string;
  let filePath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'saverlly-agent-status-'));
    filePath = path.join(tmpDir, 'nested', 'status-state.json');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('defaults to active=true when no status check has ever run', () => {
    expect(isAgentActive(filePath)).toBe(true);
  });

  it('reflects true after writeAgentActiveState(true)', () => {
    writeAgentActiveState(true, filePath);
    expect(isAgentActive(filePath)).toBe(true);
  });

  it('reflects false after writeAgentActiveState(false)', () => {
    writeAgentActiveState(false, filePath);
    expect(isAgentActive(filePath)).toBe(false);
  });

  it('persists the latest write, overwriting a prior state', () => {
    writeAgentActiveState(false, filePath);
    writeAgentActiveState(true, filePath);
    expect(isAgentActive(filePath)).toBe(true);
  });

  it('treats a corrupt state file as "never checked" (defaults true) rather than throwing', () => {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, '{ not valid json', 'utf8');
    expect(isAgentActive(filePath)).toBe(true);
  });
});
