import { execFileSync } from 'child_process';
import * as fs from 'fs';
import {
  ANNOUNCEMENT_CANVAS_HEIGHT,
  ANNOUNCEMENT_CANVAS_WIDTH,
  ANNOUNCEMENT_TOAST_MARGIN,
  AnnouncementRepeatPolicy,
  type ActiveAnnouncement,
} from '@saverlly/shared-types';
import {
  announcementOverlayHtmlPath,
  announcementOverlayResultPath,
  announcementOverlayScriptPath,
} from './paths';
import {
  ANNOUNCEMENT_OVERLAY_TASK_NAME,
  WEBVIEW2_ASSEMBLIES,
  canRenderWebView2Overlay,
  getInteractiveUsername,
  hasWebView2Assemblies,
  isWebView2RuntimeInstalled,
  showAnnouncementOverlay,
} from './overlay';

jest.mock('child_process');
jest.mock('fs');

const mockExecFileSync = execFileSync as jest.MockedFunction<typeof execFileSync>;
const mockMkdirSync = fs.mkdirSync as jest.MockedFunction<typeof fs.mkdirSync>;
const mockWriteFileSync = fs.writeFileSync as jest.MockedFunction<typeof fs.writeFileSync>;
const mockExistsSync = fs.existsSync as jest.MockedFunction<typeof fs.existsSync>;
const mockReadFileSync = fs.readFileSync as jest.MockedFunction<typeof fs.readFileSync>;
const mockStatSync = fs.statSync as jest.MockedFunction<typeof fs.statSync>;

const WEBVIEW2_DIR = 'C:\\Program Files\\Saverlly\\webview2';

function schtasksCalls() {
  return mockExecFileSync.mock.calls.filter((call) => call[0] === 'schtasks');
}

/** What `reg query <key> /v pv` actually prints when the runtime is installed. */
function regPvOutput(version: string): string {
  return `\r\nHKEY_LOCAL_MACHINE\\SOFTWARE\\WOW6432Node\\Microsoft\\EdgeUpdate\\Clients\\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}\r\n    pv    REG_SZ    ${version}\r\n\r\n`;
}

/**
 * The default mock: somebody is logged in, and the WebView2 runtime is present. Individual tests
 * override `runtimeVersion` (or pass null for "key missing") to exercise the fallback.
 */
function mockEnvironment({
  username = 'KIOSK-PC\\JohnDoe\r\n',
  runtimeVersion = '151.0.4129.107' as string | null,
} = {}) {
  mockExecFileSync.mockImplementation(((file: string) => {
    if (file === 'reg') {
      if (runtimeVersion === null) throw new Error('ERROR: The system was unable to find the specified registry key');
      return regPvOutput(runtimeVersion);
    }
    if (file === 'powershell.exe') return username;
    return '';
  }) as never);
}

function written(index = 0): string {
  return mockWriteFileSync.mock.calls[index][1] as string;
}

/** The file written to announcementOverlayScriptPath(), whichever call that was. The WebView2
 *  path writes the HTML first, the legacy path writes only the script. */
function writtenScript(): string {
  const call = mockWriteFileSync.mock.calls.find(
    ([target]) => target === announcementOverlayScriptPath(),
  );
  return call![1] as string;
}

/**
 * Makes the overlay's receipt appear immediately, echoing back whatever attempt id the script
 * under test embedded. That id is generated inside showAnnouncementOverlay, so it's recovered
 * from the written script rather than guessed. Pass status 'missing' for "no receipt ever
 * arrives", which is what a hung or killed overlay looks like.
 */
function mockReceipt(status: 'rendered' | 'failed' | 'missing', reason = '') {
  mockReadFileSync.mockImplementation(((target: string) => {
    if (status === 'missing' || target !== announcementOverlayResultPath()) {
      throw new Error('ENOENT: no such file or directory');
    }
    const scriptCall = mockWriteFileSync.mock.calls.find(
      ([t]) => t === announcementOverlayScriptPath(),
    );
    const attemptId = /\$attemptId = '([^']+)'/.exec((scriptCall?.[1] as string) ?? '')?.[1];
    if (!attemptId) throw new Error('ENOENT: no such file or directory');
    // PowerShell 5.1 writes a BOM, so the real file has one too.
    return `﻿${attemptId}
${status}
${reason}`;
  }) as never);
}

/** No lock file by default. StatSync throwing is how "nothing is on screen" looks. */
function mockNoOverlayShowing() {
  mockStatSync.mockImplementation((() => {
    throw new Error('ENOENT: no such file or directory');
  }) as never);
}

function announcement(overrides: Partial<ActiveAnnouncement> = {}): ActiveAnnouncement {
  return {
    id: 'ann-1',
    title: 'Sale',
    body: 'Everything 20% off',
    mediaUrl: null,
    repeatPolicy: AnnouncementRepeatPolicy.ONCE,
    maxDisplayCount: null,
    layout: null,
    ...overrides,
  };
}

describe('getInteractiveUsername', () => {
  beforeEach(() => {
    mockExecFileSync.mockReset();
  });

  it('returns the trimmed WMI console-user output', () => {
    mockExecFileSync.mockReturnValue('KIOSK-PC\\JohnDoe\r\n' as never);

    expect(getInteractiveUsername()).toBe('KIOSK-PC\\JohnDoe');
  });

  it('returns null when nobody is logged in (empty output)', () => {
    mockExecFileSync.mockReturnValue('\r\n' as never);

    expect(getInteractiveUsername()).toBeNull();
  });

  it('returns null if the WMI query itself fails', () => {
    mockExecFileSync.mockImplementation(() => {
      throw new Error('boom');
    });

    expect(getInteractiveUsername()).toBeNull();
  });
});

describe('hasWebView2Assemblies', () => {
  beforeEach(() => mockExistsSync.mockReset());

  it('requires every assembly, not just some, a partial copy is a broken install', () => {
    mockExistsSync.mockImplementation(
      (target) => !String(target).endsWith('WebView2Loader.dll'),
    );
    expect(hasWebView2Assemblies(WEBVIEW2_DIR)).toBe(false);

    mockExistsSync.mockReturnValue(true);
    expect(hasWebView2Assemblies(WEBVIEW2_DIR)).toBe(true);
    expect(WEBVIEW2_ASSEMBLIES).toHaveLength(3);
  });
});

describe('isWebView2RuntimeInstalled', () => {
  beforeEach(() => mockExecFileSync.mockReset());

  it('reads the version out of reg query output', () => {
    mockEnvironment({ runtimeVersion: '151.0.4129.107' });
    expect(isWebView2RuntimeInstalled()).toBe(true);
  });

  it('treats a missing key as not installed', () => {
    mockEnvironment({ runtimeVersion: null });
    expect(isWebView2RuntimeInstalled()).toBe(false);
  });

  // Microsoft writes 0.0.0.0 for "known but not actually installed". The exact case a naive
  // "does the key exist" check would get wrong.
  it('treats a pv of 0.0.0.0 as not installed', () => {
    mockEnvironment({ runtimeVersion: '0.0.0.0' });
    expect(isWebView2RuntimeInstalled()).toBe(false);
  });

  it('falls through to the next key rather than giving up on the first miss', () => {
    let calls = 0;
    mockExecFileSync.mockImplementation(((file: string) => {
      if (file !== 'reg') return '';
      calls += 1;
      if (calls === 1) throw new Error('not found');
      return regPvOutput('151.0.4129.107');
    }) as never);

    expect(isWebView2RuntimeInstalled()).toBe(true);
    expect(calls).toBe(2);
  });
});

describe('canRenderWebView2Overlay', () => {
  beforeEach(() => {
    mockExecFileSync.mockReset();
    mockExistsSync.mockReset();
  });

  // The bug this exists to prevent: the installer copies the DLLs during file extraction but
  // installs the runtime afterwards, so "files present" is not the same as "can render".
  it('is false when the assemblies are there but the runtime is not', () => {
    mockExistsSync.mockReturnValue(true);
    mockEnvironment({ runtimeVersion: null });

    expect(hasWebView2Assemblies(WEBVIEW2_DIR)).toBe(true);
    expect(canRenderWebView2Overlay(WEBVIEW2_DIR)).toBe(false);
  });

  it('is false when the runtime is there but the assemblies are not', () => {
    mockExistsSync.mockReturnValue(false);
    mockEnvironment();

    expect(canRenderWebView2Overlay(WEBVIEW2_DIR)).toBe(false);
  });

  it('is true only when both halves are present', () => {
    mockExistsSync.mockReturnValue(true);
    mockEnvironment();

    expect(canRenderWebView2Overlay(WEBVIEW2_DIR)).toBe(true);
  });
});

describe('showAnnouncementOverlay', () => {
  beforeEach(() => {
    mockExecFileSync.mockReset();
    mockMkdirSync.mockReset();
    mockWriteFileSync.mockReset();
    mockExistsSync.mockReset();
    mockReadFileSync.mockReset();
    mockStatSync.mockReset();
    // Calls are matched by their command name (call[0]) rather than call order, since the
    // WebView2 runtime probe adds `reg query` calls alongside the powershell/schtasks ones.
    mockEnvironment();
    mockExistsSync.mockReturnValue(true);
    mockNoOverlayShowing();
    mockReceipt('rendered');
  });

  it('does nothing and reports no-interactive-user when nobody is logged in', async () => {
    mockEnvironment({ username: '\r\n' });

    const result = await showAnnouncementOverlay(announcement(), { webview2Dir: WEBVIEW2_DIR });

    expect(result).toEqual({ shown: false, reason: 'no-interactive-user' });
    expect(mockWriteFileSync).not.toHaveBeenCalled();
    expect(schtasksCalls()).toHaveLength(0);
  });

  it('relays the overlay through a per-user scheduled task and confirms it rendered', async () => {
    const result = await showAnnouncementOverlay(announcement(), { webview2Dir: WEBVIEW2_DIR });

    expect(result).toEqual({ shown: true, renderer: 'webview2' });
    const [createCall, runCall] = schtasksCalls();
    expect(createCall[1]).toEqual(
      expect.arrayContaining([
        '/create',
        '/tn',
        ANNOUNCEMENT_OVERLAY_TASK_NAME,
        '/ru',
        'KIOSK-PC\\JohnDoe',
        '/it',
      ]),
    );
    expect(runCall[1]).toEqual(['/run', '/tn', ANNOUNCEMENT_OVERLAY_TASK_NAME]);
  });

  // The residual this whole receipt mechanism exists to close: dispatching the relay task says
  // nothing about whether anything reached the screen, so every one of these used to come back
  // as "shown" and burn a ONCE announcement's only appearance.
  describe('reporting what actually happened', () => {
    it('reports render-failed when the overlay says it could not draw', async () => {
      mockReceipt('failed', 'CoreWebView2 initialization failed: runtime missing');

      const result = await showAnnouncementOverlay(announcement(), {
        webview2Dir: WEBVIEW2_DIR,
      });

      expect(result).toEqual({
        shown: false,
        reason: 'render-failed',
        detail: 'CoreWebView2 initialization failed: runtime missing',
      });
    });

    it('reports render-timeout when no receipt ever arrives', async () => {
      mockReceipt('missing');

      const result = await showAnnouncementOverlay(announcement(), {
        webview2Dir: WEBVIEW2_DIR,
        renderTimeoutMs: 30,
        receiptPollMs: 5,
      });

      expect(result).toEqual({ shown: false, reason: 'render-timeout' });
    });

    // A receipt left behind by a previous announcement must never be read as this one's.
    it('ignores a receipt carrying a different attempt id', async () => {
      mockReadFileSync.mockReturnValue('some-other-attempt\nrendered\n' as never);

      const result = await showAnnouncementOverlay(announcement(), {
        webview2Dir: WEBVIEW2_DIR,
        renderTimeoutMs: 30,
        receiptPollMs: 5,
      });

      expect(result).toEqual({ shown: false, reason: 'render-timeout' });
    });

    it('refuses to stack a second overlay on an undismissed one', async () => {
      mockStatSync.mockReturnValue({ mtimeMs: Date.now() } as never);

      const result = await showAnnouncementOverlay(announcement(), { webview2Dir: WEBVIEW2_DIR });

      expect(result).toEqual({ shown: false, reason: 'already-showing' });
      expect(schtasksCalls()).toHaveLength(0);
    });

    // A killed process or a logoff mid-show leaves the lock behind; without an age check it
    // would block every future announcement on that machine forever.
    it('ignores a stale lock from an overlay that never cleaned up', async () => {
      mockStatSync.mockReturnValue({ mtimeMs: Date.now() - 60 * 60_000 } as never);

      const result = await showAnnouncementOverlay(announcement(), { webview2Dir: WEBVIEW2_DIR });

      expect(result).toEqual({ shown: true, renderer: 'webview2' });
    });

    it('reports dispatch-failed instead of throwing when schtasks fails', async () => {
      mockExecFileSync.mockImplementation(((file: string) => {
        if (file === 'schtasks') throw new Error('Access is denied');
        if (file === 'reg') return regPvOutput('151.0.4129.107');
        if (file === 'powershell.exe') return 'KIOSK-PC\\JohnDoe\r\n';
        return '';
      }) as never);

      const result = await showAnnouncementOverlay(announcement(), { webview2Dir: WEBVIEW2_DIR });

      expect(result).toMatchObject({ shown: false, reason: 'dispatch-failed' });
    });

    it('reports dispatch-failed instead of throwing when the script cannot be written', async () => {
      mockWriteFileSync.mockImplementation((() => {
        throw new Error('EACCES: permission denied');
      }) as never);

      const result = await showAnnouncementOverlay(announcement(), { webview2Dir: WEBVIEW2_DIR });

      expect(result).toMatchObject({ shown: false, reason: 'dispatch-failed' });
    });

    it('grants Users write access on the exchange folder by well-known SID', async () => {
      await showAnnouncementOverlay(announcement(), { webview2Dir: WEBVIEW2_DIR });

      const icacls = mockExecFileSync.mock.calls.find((call) => call[0] === 'icacls');
      // The literal name "Users" is localized; the SID is not.
      expect(icacls?.[1]).toEqual(expect.arrayContaining(['/grant', '*S-1-5-32-545:(OI)(CI)M']));
    });

    it('still shows the overlay when the ACL grant fails', async () => {
      mockExecFileSync.mockImplementation(((file: string) => {
        if (file === 'icacls') throw new Error('nope');
        if (file === 'reg') return regPvOutput('151.0.4129.107');
        if (file === 'powershell.exe') return 'KIOSK-PC\\JohnDoe\r\n';
        return '';
      }) as never);

      const result = await showAnnouncementOverlay(announcement(), { webview2Dir: WEBVIEW2_DIR });

      expect(result).toEqual({ shown: true, renderer: 'webview2' });
    });
  });

  describe('the reporting harness in the generated script', () => {
    it('reports a receipt from every exit path, including an unhandled throw', async () => {
      await showAnnouncementOverlay(announcement(), { webview2Dir: WEBVIEW2_DIR });
      const script = writtenScript();

      expect(script).toContain('Write-OverlayResult');
      // Body wrapped so an Add-Type/init exception still reports rather than dying silently.
      expect(script).toContain("Write-OverlayResult 'failed' $_.Exception.Message");
      // Backstop for a body that returns without reporting at all.
      expect(script).toContain("'overlay exited without rendering'");
      // Written to a temp file and moved, so the agent can't read a half-written receipt.
      expect(script).toContain('Move-Item -LiteralPath $tmp');
      // First writer wins, a later shutdown path must not overwrite the real cause.
      expect(script).toContain('if ($script:reported) { return }');
      // Lock taken on start, released in finally.
      expect(script).toContain('Set-Content -LiteralPath $lockPath');
      expect(script).toContain('Remove-Item -LiteralPath $lockPath');
    });

    it('reports rendered only once the document has painted, not merely on init', async () => {
      await showAnnouncementOverlay(announcement(), { webview2Dir: WEBVIEW2_DIR });
      const script = writtenScript();

      expect(script).toContain('add_NavigationCompleted');
      expect(script).toContain("Write-OverlayResult 'rendered' ''");
    });

    it('reports rendered from the legacy dialog too, once it is on screen', async () => {
      mockExistsSync.mockReturnValue(false);

      await showAnnouncementOverlay(announcement(), { webview2Dir: WEBVIEW2_DIR });
      const script = writtenScript();

      expect(script).toContain("$form.Activate(); Write-OverlayResult 'rendered' ''");
    });
  });

  describe('with the WebView2 assemblies present', () => {
    it('writes the rendered layout document and a script that loads it', async () => {
      await showAnnouncementOverlay(
        announcement({
          layout: {
            version: 1,
            background: '#0b0b0b',
            width: 400,
            height: 520,
            elements: [
              {
                id: 'b1',
                type: 'button',
                x: 10,
                y: 10,
                width: 120,
                height: 40,
                label: 'Close it',
                backgroundColor: '#0f766e',
                color: '#ffffff',
                fontFamily: 'Segoe UI',
                fontSize: 18,
                fontWeight: 600,
                radius: 8,
                action: { type: 'dismiss' as const },
              },
            ],
          },
        }),
        { webview2Dir: WEBVIEW2_DIR },
      );

      // The HTML is written first, then the host script.
      expect(mockWriteFileSync.mock.calls[0][0]).toBe(announcementOverlayHtmlPath());
      const html = written(0);
      expect(html).toContain('Close it');
      expect(html).toContain('#0b0b0b');
      expect(html).toContain('data-saverlly-dismiss');

      const script = writtenScript();
      expect(script).toContain('Microsoft.Web.WebView2.WinForms.WebView2');
      expect(script).toContain('WEBVIEW2_USER_DATA_FOLDER');
      // Must load the document off disk, not inline it.
      expect(script).toContain('file:///');
      expect(script).toContain('announcement-overlay.html');
    });

    it("renders a default design for an announcement that predates the canvas editor", async () => {
      await showAnnouncementOverlay(
        announcement({ title: 'Legacy Sale', body: 'Old style' }),
        { webview2Dir: WEBVIEW2_DIR },
      );

      const html = written(0);
      expect(html).toContain('Legacy Sale');
      expect(html).toContain('Old style');
      // Still dismissable even though nobody designed a button for it.
      expect(html).toContain('data-saverlly-dismiss');
    });

    it('escapes markup in the title so it renders as text on the kiosk', async () => {
      await showAnnouncementOverlay(
        announcement({ title: '<script>alert(1)</script>' }),
        { webview2Dir: WEBVIEW2_DIR },
      );

      const html = written(0);
      expect(html).not.toContain('<script>alert(1)');
      expect(html).toContain('&lt;script&gt;');
    });

    // The complaint this replaced: the overlay took the whole screen, and looked soft doing it.
    describe('the toast window', () => {
      it('anchors a canvas-sized card to the working area, not the whole screen', async () => {
        await showAnnouncementOverlay(announcement(), { webview2Dir: WEBVIEW2_DIR });
        const script = writtenScript();

        // WorkingArea, not Bounds. That's what keeps the card clear of the taskbar.
        expect(script).toContain('[System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea');
        expect(script).toContain('$area.Right - $cardWidth - $margin');
        expect(script).toContain('$area.Bottom - $cardHeight - $margin');
        expect(script).toContain("$form.StartPosition = 'Manual'");
        // The old full-screen sizing must be gone, not merely overridden further down.
        expect(script).not.toContain('$form.Width = $area.Width');
      });

      it('sizes the window from the canvas in device pixels so the design renders 1:1', async () => {
        await showAnnouncementOverlay(announcement(), { webview2Dir: WEBVIEW2_DIR });
        const script = writtenScript();

        expect(script).toContain(`${ANNOUNCEMENT_CANVAS_WIDTH} * $dpiScale`);
        expect(script).toContain(`${ANNOUNCEMENT_CANVAS_HEIGHT} * $dpiScale`);
        expect(script).toContain(`${ANNOUNCEMENT_TOAST_MARGIN} * $dpiScale`);
        // WinForms would otherwise apply the DPI scale a second time on top of ours.
        expect(script).toContain("$form.AutoScaleMode = 'None'");
      });

      // The root cause of the blur: a DPI-unaware process is rendered at 96 DPI and then
      // bitmap-stretched to a 125%/150% screen, so every glyph edge is resampled.
      it('makes the process per-monitor DPI aware before any window exists', async () => {
        await showAnnouncementOverlay(announcement(), { webview2Dir: WEBVIEW2_DIR });
        const script = writtenScript();

        expect(script).toContain('SetProcessDpiAwarenessContext');
        // DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2
        expect(script).toContain('new IntPtr(-4)');
        // Windows 10 pre-1703 has no such entry point; the older call still beats being unaware.
        expect(script).toContain('SetProcessDPIAware');
        expect(script.indexOf('MakeDpiAware()')).toBeLessThan(script.indexOf('New-Object System.Drawing.Size'));
      });

      it('shows without taking focus from whatever the kiosk user is doing', async () => {
        await showAnnouncementOverlay(announcement(), { webview2Dir: WEBVIEW2_DIR });
        const script = writtenScript();

        expect(script).toContain('WS_EX_NOACTIVATE = 0x08000000');
        expect(script).toContain('protected override bool ShowWithoutActivation');
        // ShowDialog activates unconditionally, which would defeat all of the above.
        expect(script).toContain('[System.Windows.Forms.Application]::Run($form)');
        expect(script).not.toContain('$form.ShowDialog()');
        expect(script).not.toContain('$form.Activate()');
      });

      // Runtime C# compilation can fail on a locked-down machine. A blurry toast that takes focus
      // still delivers the announcement; a script that dies here delivers nothing.
      it('falls back to a plain form when the toast type cannot be compiled', async () => {
        await showAnnouncementOverlay(announcement(), { webview2Dir: WEBVIEW2_DIR });
        const script = writtenScript();

        expect(script).toContain('$useToastForm = $false');
        expect(script).toContain('else { $form = New-Object System.Windows.Forms.Form }');
      });
    });

    it('closes the window on the dismiss message and on Escape, but not on a failed init', async () => {
      await showAnnouncementOverlay(announcement(), { webview2Dir: WEBVIEW2_DIR });
      const script = writtenScript();

      expect(script).toContain("-eq 'saverlly:dismiss'");
      // Escape is the escape hatch for a layout whose button ended up unclickable.
      expect(script).toContain("$keyArgs.KeyCode -eq 'Escape'");
      // A failed init must close rather than leave a blank black window with no way out.
      expect(script).toContain('if (-not $e.IsSuccess) {');
    });

    // Buttons had no action at all before: everything was stamped with data-saverlly-dismiss, so
    // the only thing a kiosk owner could change about a button was its label.
    describe('a link a kiosk owner attached to a button', () => {
      it('opens the target rather than only closing the toast', async () => {
        await showAnnouncementOverlay(announcement(), { webview2Dir: WEBVIEW2_DIR });
        const script = writtenScript();

        expect(script).toContain("$message -like 'saverlly:open:*'");
        expect(script).toContain('Start-Process $target');
      });

      // This string reaches Start-Process, so the last gate before the shell is the one that has
      // to hold, whatever the layout sanitizer already rejected upstream.
      it('re-validates the scheme before handing anything to the shell', async () => {
        await showAnnouncementOverlay(announcement(), { webview2Dir: WEBVIEW2_DIR });
        const script = writtenScript();

        expect(script).toContain("$target -match '^(https?://|mailto:)");
        expect(script.indexOf('-match')).toBeLessThan(script.indexOf('Start-Process $target'));
      });
    });

    // The canvas is a per-layout choice now, not two compile-time constants, so the window has
    // to follow the design instead of always being a 400x520 portrait card.
    describe('canvas sizes other than the portrait default', () => {
      function layoutSized(width: number, height: number) {
        return { version: 1, background: '#ffffff', width, height, elements: [] };
      }

      it('sizes the window to a landscape design', async () => {
        await showAnnouncementOverlay(announcement({ layout: layoutSized(560, 320) }), {
          webview2Dir: WEBVIEW2_DIR,
        });
        const script = writtenScript();

        expect(script).toContain('560 * $dpiScale');
        expect(script).toContain('320 * $dpiScale');
        expect(script).toContain('$fullBleed = $false');
      });

      it('fills the working area for a full-screen design, and keeps the taskbar reachable', async () => {
        await showAnnouncementOverlay(announcement({ layout: layoutSized(1280, 720) }), {
          webview2Dir: WEBVIEW2_DIR,
        });
        const script = writtenScript();

        expect(script).toContain('$fullBleed = $true');
        expect(script).toContain('$cardWidth = $area.Width');
        // WorkingArea, not Bounds: even a takeover leaves the taskbar, so a kiosk is never
        // genuinely trapped behind an announcement.
        expect(script).not.toContain('PrimaryScreen.Bounds');
      });
    });
  });

  describe('when the WebView2 overlay cannot render', () => {
    beforeEach(() => mockExistsSync.mockReturnValue(false));

    // The fresh-install window: files are on disk, the runtime bootstrapper hasn't run yet (or
    // couldn't, offline). Taking the WebView2 path here would show the kiosk user a blank screen
    // AND still mark a ONCE announcement as shown.
    it('falls back when the assemblies are present but the runtime is not', async () => {
      mockExistsSync.mockReturnValue(true);
      mockEnvironment({ runtimeVersion: null });

      await showAnnouncementOverlay(announcement({ title: 'Fresh Install', body: 'Runtime pending' }), {
        webview2Dir: WEBVIEW2_DIR,
      });

      const script = writtenScript();
      expect(script).toContain("$form.Text = 'Fresh Install'");
      expect(script).not.toContain('WebView2');
      expect(
        mockWriteFileSync.mock.calls.some(([t]) => t === announcementOverlayHtmlPath()),
      ).toBe(false);
    });

    it('falls back to the legacy WinForms dialog rather than showing nothing', async () => {
      await showAnnouncementOverlay(announcement({ title: 'Big Sale', body: 'Save now' }), {
        webview2Dir: WEBVIEW2_DIR,
      });

      const script = writtenScript();
      expect(script).toContain("$form.Text = 'Big Sale'");
      expect(script).toContain("$label.Text = 'Save now'");
      expect(script).not.toContain('WebView2');
      // Degraded in looks, but it lands in the same corner rather than in the middle of the
      // screen. The placement is the part the kiosk user notices.
      expect(script).toContain("$form.StartPosition = 'Manual'");
      expect(script).toContain(
        `$area.Right - $form.Width - ${ANNOUNCEMENT_TOAST_MARGIN}`,
      );
      // No layout document is written when nothing can render it.
      expect(
        mockWriteFileSync.mock.calls.some(([t]) => t === announcementOverlayHtmlPath()),
      ).toBe(false);
    });

    it("escapes a single quote so it can't break out of the PowerShell string", async () => {
      await showAnnouncementOverlay(announcement({ title: "Kiosk's Sale", body: "Don't miss it" }), {
        webview2Dir: WEBVIEW2_DIR,
      });

      const script = writtenScript();
      expect(script).toContain("$form.Text = 'Kiosk''s Sale'");
      expect(script).toContain("$label.Text = 'Don''t miss it'");
    });

    it('embeds an image-download block only when there is a mediaUrl', async () => {
      await showAnnouncementOverlay(announcement({ mediaUrl: 'https://example.com/pic.png' }), {
        webview2Dir: WEBVIEW2_DIR,
      });
      expect(writtenScript()).toContain("Invoke-WebRequest -Uri 'https://example.com/pic.png'");

      mockWriteFileSync.mockClear();
      await showAnnouncementOverlay(announcement(), { webview2Dir: WEBVIEW2_DIR });
      expect(writtenScript()).not.toContain('Invoke-WebRequest');
    });
  });
});
