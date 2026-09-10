import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { CouponSource } from '@prisma/client';
import * as Sentry from '@sentry/node';
import { Job } from 'bullmq';
import { Page, Response, chromium } from 'playwright';
import { PrismaService } from '../../prisma/prisma.service';
import { QUEUE_NAMES } from '../queue-names';

interface ScrapeCouponsJobData {
  scrapeSourceId: string;
}

interface SelectorConfig {
  codeSelector: string;
  descriptionSelector?: string;
  revealSelector?: string;
}

// Bounds how many reveal buttons a single scrape run will click, so a page with an unexpectedly
// large offer list can't turn one scheduled job into an unbounded run.
const MAX_REVEALS_PER_RUN = 25;
const REVEAL_CLICK_DELAY_MS = 300;
const POPUP_LOAD_TIMEOUT_MS = 8_000;
// domcontentloaded fires before client-side JS has rendered the real content -- reading a
// codeSelector right after it, as this used to (both for popups and the main page), raced that
// render and came back empty on a majority of runs in production testing even though the page had
// genuinely loaded. This settle delay lets the render finish before any read is trusted. Used
// after every navigation (main page and popups) and again after the reveal-click loop, since a
// reveal can update the DOM in place with the same render lag.
const RENDER_SETTLE_MS = 1_800;
const CONSENT_WAIT_TIMEOUT_MS = 6_000;

// Coupon aggregator sites (RetailMeNot, etc.) put pages behind bot-detection challenges that key
// off Playwright/Puppeteer's default headless fingerprint (an explicit "HeadlessChrome" UA and a
// telltale default viewport). Presenting an ordinary desktop-Chrome UA/viewport/locale -- the same
// thing every real visitor's browser sends -- is enough to pass; this isn't fingerprint spoofing
// beyond that, and we don't attempt to solve the interactive challenge itself.
const SCRAPE_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const SCRAPE_VIEWPORT = { width: 1366, height: 900 };

// Every consent-management platform with meaningful market share, as one combined CSS selector --
// a plain comma-separated selector already matches "any of these", so no per-vendor branching is
// needed. Covers OneTrust (confirmed live on RetailMeNot), Cookiebot, TrustArc, Quantcast/
// Sourcepoint's IAB TCF widget, Didomi, and Osano. Absent entirely on sites that don't run one of
// these, so this is a no-op there, not a maybe-broken guess.
const CONSENT_ACCEPT_SELECTOR = [
  '#onetrust-accept-btn-handler',
  '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll',
  '#CybotCookiebotDialogBodyButtonAccept',
  '#truste-consent-button',
  '.qc-cmp2-summary-buttons button[mode="primary"]',
  '#didomi-notice-agree-button',
  '.osano-cm-accept-all',
].join(', ');

// Phrases that show up in the *title or body text* of a bot-detection interstitial (Cloudflare,
// PerimeterX, DataDome, and generic "prove you're human" pages) rather than the site's real
// content. This is intentionally limited to recognizing that we're blocked, not solving the
// challenge -- there is no attempt here to defeat Turnstile, PerimeterX, DataDome, or a CAPTCHA;
// doing that would mean spoofing browser fingerprints or automating challenge-solving, which is
// out of scope. Detecting the wall turns a silent, misleading "Scraped 0 code(s)" into a real
// failure that surfaces (Sentry + a failed BullMQ job) and gets the existing retry/backoff, rather
// than looking identical to "this merchant genuinely has no active codes right now."
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

async function detectBotWall(page: Page, response: Response | null): Promise<string | null> {
  const title = await page.title().catch(() => '');
  const bodyText = await page
    .evaluate(() => document.body?.innerText?.slice(0, 1_000) ?? '')
    .catch(() => '');
  const haystack = `${title}\n${bodyText}`.toLowerCase();
  const marker = BOT_WALL_MARKERS.find((m) => haystack.includes(m));
  if (marker) return `page text matched "${marker}"`;

  const hasChallengeFrame = await page
    .$$eval('iframe', (frames) =>
      frames.some((frame) => /captcha|turnstile|challenges\.cloudflare/i.test(frame.src || '')),
    )
    .catch(() => false);
  if (hasChallengeFrame) return 'challenge iframe present';

  const status = response?.status() ?? 0;
  if (status === 403 || status === 429 || status === 503) return `HTTP ${status}`;

  return null;
}

// A best-effort shape check, not a guarantee: real coupon codes are near-universally uppercase
// alphanumeric with no spaces, which filters out prose-like junk (button labels, nav items) that
// can otherwise slip through a codeSelector match -- especially after a reveal click, where sites
// that open a popup tend to reload their whole page rather than just the one revealed offer (see
// the popup-handling comment below). It can't distinguish a real code from an unrelated word that
// happens to already be all-caps (e.g. a "STYLE" category label) -- selector precision still does
// most of the real work; this only catches what selectors can't. Deliberately left case-sensitive:
// loosening it to accept lowercase/mixed-case would let through exactly the junk labels
// (descriptive text is almost never all-uppercase) this exists to filter, in exchange for
// supporting mixed-case codes no configured source currently uses -- not a trade worth making
// speculatively. Revisit if a real source needs a lowercase/mixed-case code.
function looksLikeCouponCode(text: string): boolean {
  return /^[A-Z0-9-]{3,20}$/.test(text);
}

@Processor(QUEUE_NAMES.SCRAPE_COUPONS)
export class ScrapeCouponsProcessor extends WorkerHost {
  private readonly logger = new Logger(ScrapeCouponsProcessor.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job<ScrapeCouponsJobData>): Promise<void> {
    const source = await this.prisma.scrapeSource.findUnique({
      where: { id: job.data.scrapeSourceId },
    });
    if (!source || !source.active) {
      return;
    }

    if (!source.merchantId) {
      // Multi-merchant scrape pages need a per-extracted-item merchant resolution strategy
      // that isn't specified. Skip cleanly rather than guess which merchant a code belongs to.
      this.logger.warn(`Skipping scrape source ${source.id}: no merchantId set`);
      return;
    }

    const config = source.selectorConfig as unknown as SelectorConfig;
    const browser = await chromium.launch();
    try {
      const context = await browser.newContext({
        userAgent: SCRAPE_USER_AGENT,
        viewport: SCRAPE_VIEWPORT,
        locale: 'en-US',
        extraHTTPHeaders: { 'Accept-Language': 'en-US,en;q=0.9' },
      });
      const page = await context.newPage();
      // "Get code" buttons on sites needing revealSelector sometimes open a new tab on click
      // rather than revealing in place -- occasionally the merchant site or an affiliate
      // redirect (not wanted, closed unread), but sometimes the code itself, reloaded onto a
      // permalink of the same listing page (e.g. "?outclicked=true&u=<offerId>"). Since we can't
      // tell which case we're in ahead of time, read the popup's own codeSelector matches before
      // closing it -- a redirect/ad popup just won't have anything matching, so it's a no-op for
      // that case and a real capture for the reveal-via-new-tab case. Each read runs in the
      // background (a popup can open mid-reveal-loop), so its promise is collected in
      // popupReads and awaited below -- otherwise the codes array gets finalized before any
      // popup has finished loading, and every popup-only code is silently lost.
      const popupCodes: string[] = [];
      const popupReads: Promise<void>[] = [];
      context.on('page', (popup) => {
        popupReads.push(
          (async () => {
            try {
              await popup.waitForLoadState('domcontentloaded', { timeout: POPUP_LOAD_TIMEOUT_MS });
              await popup.waitForTimeout(RENDER_SETTLE_MS);
              const found = await popup.$$eval(config.codeSelector, (elements) =>
                elements.map((el) => el.textContent?.trim()).filter((text): text is string => !!text),
              );
              popupCodes.push(...found);
            } catch (error) {
              this.logger.warn(
                `Popup read failed for source ${source.id}: ${error instanceof Error ? error.message : error}`,
              );
            } finally {
              await popup.close().catch(() => {});
            }
          })(),
        );
      });
      // A real navigation failure (DNS, timeout, connection refused) is left to throw and
      // propagate to the existing attempts/backoff below, same as before this change -- only a
      // page that *did* load is worth inspecting for a bot-detection interstitial.
      const response = await page.goto(source.url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await page.waitForTimeout(RENDER_SETTLE_MS);

      const botWall = await detectBotWall(page, response);
      if (botWall) {
        const message = `Blocked by bot-detection (${botWall}) for source ${source.id} (${source.url})`;
        this.logger.error(message);
        Sentry.captureException(new Error(message));
        // Throwing here (rather than logging "Scraped 0" and moving on) hands this to the
        // queue's existing attempts/backoff (see ScrapeSourcesModule) -- a real chance of getting
        // through on retry if the block was IP/session-transient, and a job BullMQ marks failed
        // -- rather than a result indistinguishable from "this merchant has no active codes".
        throw new Error(message);
      }

      // A consent-manager backdrop (OneTrust confirmed live on RetailMeNot; the combined selector
      // above also covers Cookiebot/TrustArc/Quantcast/Didomi/Osano) sits on top of everything and
      // silently times out any click underneath it -- including reveal buttons, with no error
      // indicating why. These all inject asynchronously well after domcontentloaded (confirmed for
      // OneTrust: an immediate page.$() check always came back null), so a one-shot lookup is a
      // lost race -- waitForSelector actively waits instead; the short timeout is just "give up
      // and proceed" for sites that never show one at all.
      const consentButton = await page
        .waitForSelector(CONSENT_ACCEPT_SELECTOR, { timeout: CONSENT_WAIT_TIMEOUT_MS, state: 'visible' })
        .catch(() => null);
      if (consentButton) {
        await consentButton.click({ timeout: 5_000 }).catch(() => {});
        await page.waitForTimeout(500);
      }

      if (config.revealSelector) {
        const revealButtons = await page.$$(config.revealSelector);
        for (const button of revealButtons.slice(0, MAX_REVEALS_PER_RUN)) {
          try {
            await button.click({ timeout: 5_000 });
            await page.waitForTimeout(REVEAL_CLICK_DELAY_MS);
          } catch (error) {
            this.logger.warn(
              `Reveal click failed for source ${source.id}: ${error instanceof Error ? error.message : error}`,
            );
          }
        }
      }

      await Promise.all(popupReads);
      // Mirrors the popup settle wait: a reveal click that updates codes in place (no popup, no
      // navigation) is client-rendered too, and this read raced that the same way the popup read
      // used to before RENDER_SETTLE_MS was added there.
      await page.waitForTimeout(RENDER_SETTLE_MS);

      // A reveal click can navigate the original page itself (not just open a popup, e.g. an
      // affiliate redirect firing on both), so this read races that navigation. Falling back to
      // an empty list on failure keeps popup-sourced codes intact rather than losing the whole
      // run to an "execution context destroyed" error.
      const pageCodes = await page
        .$$eval(config.codeSelector, (elements) =>
          elements.map((el) => el.textContent?.trim()).filter((text): text is string => !!text),
        )
        .catch((error) => {
          this.logger.warn(
            `Main page read failed for source ${source.id}: ${error instanceof Error ? error.message : error}`,
          );
          return [];
        });

      const codes = [...new Set([...pageCodes, ...popupCodes])].filter(looksLikeCouponCode);

      for (const code of codes) {
        await this.prisma.coupon.upsert({
          where: { merchantId_code: { merchantId: source.merchantId, code } },
          update: { source: CouponSource.SCRAPE, active: true },
          create: { merchantId: source.merchantId, code, source: CouponSource.SCRAPE },
        });
      }

      this.logger.log(`Scraped ${codes.length} code(s) from source ${source.id}`);
    } finally {
      await browser.close();
      await this.prisma.scrapeSource.update({
        where: { id: source.id },
        data: { lastRunAt: new Date() },
      });
    }
  }
}
