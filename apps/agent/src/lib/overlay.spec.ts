import { execFileSync } from 'child_process';
import * as fs from 'fs';
import { AnnouncementRepeatPolicy, type ActiveAnnouncement } from '@saverlly/shared-types';
import { announcementOverlayHtmlPath, announcementOverlayScriptPath } from './paths';
import {
  ANNOUNCEMENT_OVERLAY_TASK_NAME,
  WEBVIEW2_ASSEMBLIES,
  getInteractiveUsername,
  hasWebView2Assemblies,
  showAnnouncementOverlay,
} from './overlay';

jest.mock('child_process');
jest.mock('fs');

const mockExecFileSync = execFileSync as jest.MockedFunction<typeof execFileSync>;
const mockMkdirSync = fs.mkdirSync as jest.MockedFunction<typeof fs.mkdirSync>;
const mockWriteFileSync = fs.writeFileSync as jest.MockedFunction<typeof fs.writeFileSync>;
const mockExistsSync = fs.existsSync as jest.MockedFunction<typeof fs.existsSync>;

const WEBVIEW2_DIR = 'C:\\Program Files\\Saverlly\\webview2';

function schtasksCalls() {
  return mockExecFileSync.mock.calls.filter((call) => call[0] === 'schtasks');
}

function written(index = 0): string {
  return mockWriteFileSync.mock.calls[index][1] as string;
}

/** The file written to announcementOverlayScriptPath(), whichever call that was — the WebView2
 *  path writes the HTML first, the legacy path writes only the script. */
function writtenScript(): string {
  const call = mockWriteFileSync.mock.calls.find(
    ([target]) => target === announcementOverlayScriptPath(),
  );
  return call![1] as string;
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

  it('requires every assembly, not just some — a partial copy is a broken install', () => {
    mockExistsSync.mockImplementation(
      (target) => !String(target).endsWith('WebView2Loader.dll'),
    );
    expect(hasWebView2Assemblies(WEBVIEW2_DIR)).toBe(false);

    mockExistsSync.mockReturnValue(true);
    expect(hasWebView2Assemblies(WEBVIEW2_DIR)).toBe(true);
    expect(WEBVIEW2_ASSEMBLIES).toHaveLength(3);
  });
});

describe('showAnnouncementOverlay', () => {
  beforeEach(() => {
    mockExecFileSync.mockReset();
    mockMkdirSync.mockReset();
    mockWriteFileSync.mockReset();
    mockExistsSync.mockReset();
    // First call inside showAnnouncementOverlay is always the getInteractiveUsername powershell
    // query; subsequent calls are the schtasks create/run — matched by call[0] in schtasksCalls().
    mockExecFileSync.mockReturnValue('KIOSK-PC\\JohnDoe\r\n' as never);
    mockExistsSync.mockReturnValue(true);
  });

  it('does nothing and returns false when nobody is logged in', () => {
    mockExecFileSync.mockReturnValue('\r\n' as never);

    const result = showAnnouncementOverlay(announcement(), { webview2Dir: WEBVIEW2_DIR });

    expect(result).toBe(false);
    expect(mockWriteFileSync).not.toHaveBeenCalled();
    expect(schtasksCalls()).toHaveLength(0);
  });

  it('relays the overlay through a per-user scheduled task, then returns true', () => {
    const result = showAnnouncementOverlay(announcement(), { webview2Dir: WEBVIEW2_DIR });

    expect(result).toBe(true);
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

  describe('with the WebView2 assemblies present', () => {
    it('writes the rendered layout document and a script that loads it', () => {
      showAnnouncementOverlay(
        announcement({
          layout: {
            version: 1,
            background: '#0b0b0b',
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

    it("renders a default design for an announcement that predates the canvas editor", () => {
      showAnnouncementOverlay(
        announcement({ title: 'Legacy Sale', body: 'Old style' }),
        { webview2Dir: WEBVIEW2_DIR },
      );

      const html = written(0);
      expect(html).toContain('Legacy Sale');
      expect(html).toContain('Old style');
      // Still dismissable even though nobody designed a button for it.
      expect(html).toContain('data-saverlly-dismiss');
    });

    it('escapes markup in the title so it renders as text on the kiosk', () => {
      showAnnouncementOverlay(
        announcement({ title: '<script>alert(1)</script>' }),
        { webview2Dir: WEBVIEW2_DIR },
      );

      const html = written(0);
      expect(html).not.toContain('<script>alert(1)');
      expect(html).toContain('&lt;script&gt;');
    });

    it('closes the window on the dismiss message and on Escape, but not on a failed init', () => {
      showAnnouncementOverlay(announcement(), { webview2Dir: WEBVIEW2_DIR });
      const script = writtenScript();

      expect(script).toContain("-eq 'saverlly:dismiss'");
      // Escape is the escape hatch for a layout whose button ended up unclickable.
      expect(script).toContain("$keyArgs.KeyCode -eq 'Escape'");
      // A failed init must close rather than leave a blank black window with no way out.
      expect(script).toContain('if (-not $e.IsSuccess) { $form.Close(); return }');
    });
  });

  describe('without the WebView2 assemblies', () => {
    beforeEach(() => mockExistsSync.mockReturnValue(false));

    it('falls back to the legacy WinForms dialog rather than showing nothing', () => {
      showAnnouncementOverlay(announcement({ title: 'Big Sale', body: 'Save now' }), {
        webview2Dir: WEBVIEW2_DIR,
      });

      const script = writtenScript();
      expect(script).toContain("$form.Text = 'Big Sale'");
      expect(script).toContain("$label.Text = 'Save now'");
      expect(script).not.toContain('WebView2');
      // No layout document is written when nothing can render it.
      expect(
        mockWriteFileSync.mock.calls.some(([t]) => t === announcementOverlayHtmlPath()),
      ).toBe(false);
    });

    it("escapes a single quote so it can't break out of the PowerShell string", () => {
      showAnnouncementOverlay(announcement({ title: "Kiosk's Sale", body: "Don't miss it" }), {
        webview2Dir: WEBVIEW2_DIR,
      });

      const script = writtenScript();
      expect(script).toContain("$form.Text = 'Kiosk''s Sale'");
      expect(script).toContain("$label.Text = 'Don''t miss it'");
    });

    it('embeds an image-download block only when there is a mediaUrl', () => {
      showAnnouncementOverlay(announcement({ mediaUrl: 'https://example.com/pic.png' }), {
        webview2Dir: WEBVIEW2_DIR,
      });
      expect(writtenScript()).toContain("Invoke-WebRequest -Uri 'https://example.com/pic.png'");

      mockWriteFileSync.mockClear();
      showAnnouncementOverlay(announcement(), { webview2Dir: WEBVIEW2_DIR });
      expect(writtenScript()).not.toContain('Invoke-WebRequest');
    });
  });
});
