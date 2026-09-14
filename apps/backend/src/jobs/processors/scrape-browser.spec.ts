import { EventEmitter } from 'node:events';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { chromium } from 'playwright';
import { launchDetachedChromium } from './scrape-browser';

jest.mock('node:child_process', () => ({ spawn: jest.fn() }));
jest.mock('node:fs/promises', () => ({
  mkdtemp: jest.fn(),
  readFile: jest.fn(),
  rm: jest.fn(),
}));
jest.mock('playwright', () => ({
  chromium: { executablePath: () => 'chromium', connectOverCDP: jest.fn() },
}));

describe('owned scraping browser lifecycle', () => {
  const originalFetch = global.fetch;
  let child: EventEmitter & { kill: jest.Mock };
  const close = jest.fn();
  beforeEach(() => {
    jest.clearAllMocks();
    child = Object.assign(new EventEmitter(), {
      kill: jest.fn(() => {
        child.emit('exit');
        return true;
      }),
    });
    jest
      .mocked(spawn)
      .mockReturnValue(child as unknown as ReturnType<typeof spawn>);
    jest.mocked(mkdtemp).mockResolvedValue('owned-profile');
    jest.mocked(readFile).mockResolvedValue('54321\n/devtools/browser/owned');
    jest.mocked(rm).mockResolvedValue(undefined);
    close.mockResolvedValue(undefined);
    jest.mocked(chromium.connectOverCDP).mockResolvedValue({ close } as never);
    global.fetch = jest.fn().mockResolvedValue({ ok: true });
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('uses the owned profile port and releases both process and profile', async () => {
    const result = await launchDetachedChromium();
    expect(chromium.connectOverCDP).toHaveBeenCalledWith(
      'http://127.0.0.1:54321',
      { timeout: 10_000 },
    );
    await result.cleanup();
    expect(close).toHaveBeenCalled();
    expect(child.kill).toHaveBeenCalledWith('SIGKILL');
    expect(rm).toHaveBeenCalledWith(
      'owned-profile',
      expect.objectContaining({ recursive: true }),
    );
  });

  it('cleans up if CDP attachment fails', async () => {
    jest
      .mocked(chromium.connectOverCDP)
      .mockRejectedValue(new Error('attach failed'));
    await expect(launchDetachedChromium()).rejects.toThrow('attach failed');
    expect(child.kill).toHaveBeenCalled();
    expect(rm).toHaveBeenCalled();
  });

  it('handles asynchronous spawn errors without leaking the profile', async () => {
    jest.mocked(readFile).mockImplementation(async () => {
      child.emit('error', new Error('spawn failed'));
      return '';
    });
    await expect(launchDetachedChromium()).rejects.toThrow('spawn failed');
    expect(chromium.connectOverCDP).not.toHaveBeenCalled();
    expect(rm).toHaveBeenCalled();
  });

  it('cleans the profile if process creation throws synchronously', async () => {
    jest.mocked(spawn).mockImplementationOnce(() => {
      throw new Error('invalid executable');
    });
    await expect(launchDetachedChromium()).rejects.toThrow(
      'invalid executable',
    );
    expect(rm).toHaveBeenCalled();
  });
});
