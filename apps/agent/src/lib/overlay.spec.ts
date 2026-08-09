import { spawn } from 'child_process';
import { showAnnouncementOverlay } from './overlay';

jest.mock('child_process');
const mockSpawn = spawn as jest.MockedFunction<typeof spawn>;

function decodeEncodedCommand(args: readonly string[] | undefined): string {
  const index = args?.indexOf('-EncodedCommand') ?? -1;
  const encoded = args?.[index + 1] ?? '';
  return Buffer.from(encoded, 'base64').toString('utf16le');
}

describe('showAnnouncementOverlay', () => {
  const unref = jest.fn();

  beforeEach(() => {
    mockSpawn.mockReset();
    unref.mockReset();
    mockSpawn.mockReturnValue({ unref } as never);
  });

  it('spawns powershell detached and unref()s it, so the poll loop is never blocked', () => {
    showAnnouncementOverlay('Sale', 'Everything 20% off');

    expect(mockSpawn).toHaveBeenCalledWith(
      'powershell.exe',
      expect.arrayContaining(['-NoProfile', '-NonInteractive', '-EncodedCommand']),
      expect.objectContaining({ detached: true, stdio: 'ignore' }),
    );
    expect(unref).toHaveBeenCalled();
  });

  it('embeds the title and body text (unescaped) in the decoded script', () => {
    showAnnouncementOverlay('Big Sale', 'Save now');

    const args = mockSpawn.mock.calls[0][1] as string[];
    const decoded = decodeEncodedCommand(args);
    expect(decoded).toContain("$form.Text = 'Big Sale'");
    expect(decoded).toContain("$label.Text = 'Save now'");
  });

  it("escapes a single quote in title/body so it can't break out of the PowerShell string", () => {
    showAnnouncementOverlay("Kiosk's Sale", "Don't miss it");

    const args = mockSpawn.mock.calls[0][1] as string[];
    const decoded = decodeEncodedCommand(args);
    expect(decoded).toContain("$form.Text = 'Kiosk''s Sale'");
    expect(decoded).toContain("$label.Text = 'Don''t miss it'");
  });
});
