import { execFileSync } from 'child_process';
import * as fs from 'fs';
import { announcementOverlayScriptPath } from './paths';
import { ANNOUNCEMENT_OVERLAY_TASK_NAME, getInteractiveUsername, showAnnouncementOverlay } from './overlay';

jest.mock('child_process');
jest.mock('fs');

const mockExecFileSync = execFileSync as jest.MockedFunction<typeof execFileSync>;
const mockMkdirSync = fs.mkdirSync as jest.MockedFunction<typeof fs.mkdirSync>;
const mockWriteFileSync = fs.writeFileSync as jest.MockedFunction<typeof fs.writeFileSync>;

function schtasksCalls() {
  return mockExecFileSync.mock.calls.filter((call) => call[0] === 'schtasks');
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

describe('showAnnouncementOverlay', () => {
  beforeEach(() => {
    mockExecFileSync.mockReset();
    mockMkdirSync.mockReset();
    mockWriteFileSync.mockReset();
    // First call inside showAnnouncementOverlay is always the getInteractiveUsername powershell
    // query; subsequent calls are the schtasks create/run — matched by call[0] in schtasksCalls().
    mockExecFileSync.mockReturnValue('KIOSK-PC\\JohnDoe\r\n' as never);
  });

  it('does nothing and returns false when nobody is logged in', () => {
    mockExecFileSync.mockReturnValue('\r\n' as never);

    const result = showAnnouncementOverlay('Sale', 'Everything 20% off');

    expect(result).toBe(false);
    expect(mockWriteFileSync).not.toHaveBeenCalled();
    expect(schtasksCalls()).toHaveLength(0);
  });

  it('writes the popup script and relays it via a per-user scheduled task, then returns true', () => {
    const result = showAnnouncementOverlay('Sale', 'Everything 20% off');

    expect(result).toBe(true);
    expect(mockWriteFileSync).toHaveBeenCalledWith(
      announcementOverlayScriptPath(),
      expect.stringContaining("$form.Text = 'Sale'"),
      'utf8',
    );

    const [createCall, runCall] = schtasksCalls();
    expect(createCall[1]).toEqual(
      expect.arrayContaining(['/create', '/tn', ANNOUNCEMENT_OVERLAY_TASK_NAME, '/ru', 'KIOSK-PC\\JohnDoe', '/it']),
    );
    expect(runCall[1]).toEqual(['/run', '/tn', ANNOUNCEMENT_OVERLAY_TASK_NAME]);
  });

  it('embeds the title and body text (unescaped) in the written script', () => {
    showAnnouncementOverlay('Big Sale', 'Save now');

    const written = mockWriteFileSync.mock.calls[0][1] as string;
    expect(written).toContain("$form.Text = 'Big Sale'");
    expect(written).toContain("$label.Text = 'Save now'");
  });

  it("escapes a single quote in title/body so it can't break out of the PowerShell string", () => {
    showAnnouncementOverlay("Kiosk's Sale", "Don't miss it");

    const written = mockWriteFileSync.mock.calls[0][1] as string;
    expect(written).toContain("$form.Text = 'Kiosk''s Sale'");
    expect(written).toContain("$label.Text = 'Don''t miss it'");
  });

  it('embeds an image-download block wired to a PictureBox when mediaUrl is provided', () => {
    showAnnouncementOverlay('Sale', 'Everything 20% off', 'https://example.com/pic.png');

    const written = mockWriteFileSync.mock.calls[0][1] as string;
    expect(written).toContain("Invoke-WebRequest -Uri 'https://example.com/pic.png'");
    expect(written).toContain('$pictureBox = New-Object System.Windows.Forms.PictureBox');
    expect(written).toContain("$pictureBox.SizeMode = 'Zoom'");
  });

  it("escapes a single quote in mediaUrl and omits the image block entirely when there's no mediaUrl", () => {
    showAnnouncementOverlay('Sale', 'Everything 20% off', "https://example.com/pic's.png");
    const withImage = mockWriteFileSync.mock.calls[0][1] as string;
    expect(withImage).toContain("Invoke-WebRequest -Uri 'https://example.com/pic''s.png'");

    mockWriteFileSync.mockClear();
    showAnnouncementOverlay('Sale', 'Everything 20% off');
    const withoutImage = mockWriteFileSync.mock.calls[0][1] as string;
    expect(withoutImage).not.toContain('Invoke-WebRequest');
    expect(withoutImage).not.toContain('PictureBox');
  });
});
