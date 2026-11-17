import { BrowserContext, Page, Response } from 'playwright';
import { launchDetachedChromium } from '../jobs/processors/scrape-browser';

// domcontentloaded fires before client-side JS has rendered the real content -- reading a
// codeSelector right after it raced that render and came back empty on a majority of runs in
// production testing even though the page had genuinely loaded. This settle delay lets the render
// finish before any read is trusted.
export const RENDER_SETTLE_MS = 1_800;
const CONSENT_WAIT_TIMEOUT_MS = 6_000;

// Coupon aggregator sites put pages behind bot-detection challenges that key off Playwright's
// default headless fingerprint (an explicit "HeadlessChrome" UA and a telltale default viewport).
// Presenting an ordinary desktop-Chrome UA/viewport/locale is what every real visitor's browser
// sends; we don't attempt to solve the interactive challenge itself.
const SCRAPE_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const SCRAPE_VIEWPORT = { width: 1366, height: 900 };

// Retained unchanged from the previous processor and deliberately not extended: the scrapers
// back off from bot walls instead of trying harder to get past them.
const STEALTH_INIT_SCRIPT = () => {
  Object.defineProperty(navigator, 'webdriver', { get: () => false });
  // Matches SCRAPE_USER_AGENT's claimed OS (the container's Chromium reports Linux otherwise).
  Object.defineProperty(navigator, 'platform', { get: () => 'Win32' });

  // @ts-expect-error -- window.chrome doesn't exist in Playwright's TS lib types
  if (!window.chrome) {
    // @ts-expect-error -- same as above
    window.chrome = { runtime: {} };
  }

  Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });

  const fakePlugin = {
    name: 'Chrome PDF Plugin',
    filename: 'internal-pdf-viewer',
    description: 'Portable Document Format',
  };
  Object.defineProperty(navigator, 'plugins', {
    get: () => [fakePlugin, { ...fakePlugin, name: 'Chrome PDF Viewer' }],
  });
  Object.defineProperty(navigator, 'mimeTypes', {
    get: () => [{ type: 'application/pdf', suffixes: 'pdf' }],
  });

  const originalQuery = window.navigator.permissions.query.bind(
    window.navigator.permissions,
  ) as (parameters: PermissionDescriptor) => Promise<PermissionStatus>;
  window.navigator.permissions.query = (parameters: PermissionDescriptor) =>
    parameters.name === 'notifications'
      ? Promise.resolve({
          state: Notification.permission,
          name: 'notifications',
        } as PermissionStatus)
      : originalQuery(parameters);
};

// Every consent-management platform with meaningful market share, as one combined CSS selector.
// Covers OneTrust (confirmed live on RetailMeNot), Cookiebot, TrustArc, Quantcast/Sourcepoint's
// IAB TCF widget, Didomi, and Osano. A no-op on sites that don't run one of these.
const CONSENT_ACCEPT_SELECTOR = [
  '#onetrust-accept-btn-handler',
  '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll',
  '#CybotCookiebotDialogBodyButtonAccept',
  '#truste-consent-button',
  '.qc-cmp2-summary-buttons button[mode="primary"]',
  '#didomi-notice-agree-button',
  '.osano-cm-accept-all',
].join(', ');

// Phrases in the title or body text of a bot-detection interstitial (Cloudflare, PerimeterX,
// DataDome, generic "prove you're human" pages). This only recognises that we're blocked, so the
// run reports BLOCKED instead of a misleading "0 codes"; it never tries to solve the challenge.
const BOT_WALL_MARKERS = [
  'checking your browser',
  'just a moment',
  'attention required',
  'verify you are human',
  'verify you are a human',
  'unusual traffic',
  'access denied',
  'request blocked',
  'are you a robot',
  'complete the security check',
  'enable javascript and cookies',
];

/** Plain-HTTP counterpart of detectBotWall, for scrapers that never start a browser. */
export function botWallInHtml(status: number, body: string): string | null {
  const head = body.slice(0, 20_000).toLowerCase();
  const title = /<title[^>]*>([^<]*)/.exec(head)?.[1] ?? '';
  const marker = BOT_WALL_MARKERS.find((m) => title.includes(m));
  if (marker) return `page title matched "${marker}"`;
  if (/challenges\.cloudflare\.com|cf-chl-|captcha-delivery\.com/.test(head))
    return 'challenge page';
  if (status === 403 || status === 429 || status === 503)
    return `HTTP ${status}`;
  return null;
}

async function detectBotWall(
  page: Page,
  response: Response | null,
): Promise<string | null> {
  const title = await page.title().catch(() => '');
  const bodyText = await page
    .evaluate(() => document.body?.innerText?.slice(0, 1_000) ?? '')
    .catch(() => '');
  const haystack = `${title}\n${bodyText}`.toLowerCase();
  const marker = BOT_WALL_MARKERS.find((m) => haystack.includes(m));
  if (marker) return `page text matched "${marker}"`;

  const hasChallengeFrame = await page
    .$$eval('iframe', (frames) =>
      frames.some((frame) =>
        /captcha|turnstile|challenges\.cloudflare/i.test(frame.src || ''),
      ),
    )
    .catch(() => false);
  if (hasChallengeFrame) return 'challenge iframe present';

  const status = response?.status() ?? 0;
  if (status === 403 || status === 429 || status === 503)
    return `HTTP ${status}`;

  return null;
}

export interface OpenedPage {
  status: number;
  /** Why the site's bot protection turned us away, or null. */
  blocked: string | null;
}

/** One Chromium per scrape run: a context, its main page, and the shared page-opening steps. */
export class BrowserSession {
  private constructor(
    readonly context: BrowserContext,
    readonly page: Page,
    readonly browserVersion: string,
    private readonly cleanup: () => Promise<void>,
  ) {}

  static async launch(): Promise<BrowserSession> {
    const { browser, cleanup } = await launchDetachedChromium();
    try {
      const context = await browser.newContext({
        userAgent: SCRAPE_USER_AGENT,
        viewport: SCRAPE_VIEWPORT,
        locale: 'en-US',
        extraHTTPHeaders: { 'Accept-Language': 'en-US,en;q=0.9' },
      });
      await context.addInitScript(STEALTH_INIT_SCRIPT);
      const page = await context.newPage();
      return new BrowserSession(context, page, browser.version(), cleanup);
    } catch (error) {
      await cleanup().catch(() => {});
      throw error;
    }
  }

  /**
   * Opens `url` on the main page, waits for the render, checks for a bot wall and accepts a
   * cookie banner. A navigation failure (DNS, timeout) throws, so BullMQ retries it.
   */
  async open(url: string): Promise<OpenedPage> {
    const response = await this.page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });
    await this.page.waitForTimeout(RENDER_SETTLE_MS);
    const blocked = await detectBotWall(this.page, response);
    if (blocked) return { status: response?.status() ?? 0, blocked };

    // A consent backdrop silently times out any click underneath it, including reveal buttons.
    // These inject well after domcontentloaded, so wait for one rather than check once.
    const consentButton = await this.page
      .waitForSelector(CONSENT_ACCEPT_SELECTOR, {
        timeout: CONSENT_WAIT_TIMEOUT_MS,
        state: 'visible',
      })
      .catch(() => null);
    if (consentButton) {
      await consentButton.click({ timeout: 5_000 }).catch(() => {});
      await this.page.waitForTimeout(500);
    }
    return { status: response?.status() ?? 0, blocked: null };
  }

  close(): Promise<void> {
    return this.cleanup();
  }
}
