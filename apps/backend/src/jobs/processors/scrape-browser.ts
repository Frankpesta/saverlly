import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Browser, chromium } from 'playwright';

// Retain the previously working headed/CDP recipe. It does not establish that
// Runtime.enable or any particular fingerprint caused the earlier failures.
export async function launchDetachedChromium(): Promise<{
  browser: Browser;
  cleanup: () => Promise<void>;
}> {
  const userDataDir = await mkdtemp(join(tmpdir(), 'scrape-chrome-'));
  let browser: Browser | undefined;
  let child: ReturnType<typeof spawn>;
  try {
    child = spawn(
      chromium.executablePath(),
      [
        '--remote-debugging-port=0',
        '--remote-debugging-address=127.0.0.1',
        '--no-first-run',
        '--no-default-browser-check',
        '--no-sandbox',
        '--disable-dev-shm-usage',
        `--user-data-dir=${userDataDir}`,
        'about:blank',
      ],
      { stdio: 'ignore', windowsHide: true },
    );
  } catch (error) {
    await rm(userDataDir, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
  let startupError: Error | undefined;
  child.on('error', (error) => {
    startupError = error;
  });
  let exited = false;
  const exit = new Promise<void>((resolve) => {
    child.once('exit', () => {
      exited = true;
      resolve();
    });
    child.once('error', () => {
      exited = true;
      resolve();
    });
  });
  const cleanup = async () => {
    if (browser) {
      // Browser.close over CDP can disconnect without terminating the owned process.
      await browser.close().catch(() => {});
    }
    if (!exited) {
      child.kill('SIGKILL');
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          exit,
          new Promise((resolve) => {
            timer = setTimeout(resolve, 2_000);
          }),
        ]);
      } finally {
        clearTimeout(timer);
      }
    }
    // This exact directory was created by mkdtemp beneath tmpdir, never from source input.
    await rm(userDataDir, {
      recursive: true,
      force: true,
      maxRetries: 3,
      retryDelay: 100,
    });
  };
  try {
    const deadline = Date.now() + 10_000;
    let endpoint: string | undefined;
    while (Date.now() < deadline) {
      if (startupError) throw startupError;
      if (exited)
        throw new Error(
          `Chromium exited before CDP startup (code=${child.exitCode})`,
        );
      // Port zero lets the OS allocate a free port. The fresh profile's discovery file
      // prevents accidentally attaching to a different worker's browser.
      const activePort = await readFile(
        join(userDataDir, 'DevToolsActivePort'),
        'utf8',
      ).catch(() => '');
      const port = Number(activePort.split('\n')[0]);
      if (Number.isInteger(port) && port > 0 && port <= 65535) {
        const candidate = `http://127.0.0.1:${port}`;
        const ready = await fetch(`${candidate}/json/version`, {
          signal: AbortSignal.timeout(1_000),
        })
          .then((response) => response.ok)
          .catch(() => false);
        if (ready) {
          endpoint = candidate;
          break;
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (!endpoint) throw new Error('Timed out waiting for Chromium DevTools');
    browser = await chromium.connectOverCDP(endpoint, { timeout: 10_000 });
    return { browser, cleanup };
  } catch (error) {
    await cleanup().catch(() => {});
    throw error;
  }
}
