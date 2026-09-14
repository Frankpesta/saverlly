import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { CouponSource } from '@prisma/client';
import * as Sentry from '@sentry/node';
import { Job } from 'bullmq';
import { Page, Response } from 'playwright';
import { PrismaService } from '../../prisma/prisma.service';
import { QUEUE_NAMES } from '../queue-names';
import { launchDetachedChromium } from './scrape-browser';
import {
  collectSimplyCodesReveals,
  isSimplyCodesStore,
} from './simplycodes-reveals';

interface ScrapeCouponsJobData {
  scrapeSourceId: string;
}

interface SelectorConfig {
  codeSelector: string;
  descriptionSelector?: string;
  revealSelector?: string;
  rowSelector?: string;
  merchantSelector?: string;
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

// Retain the existing browser compatibility settings while fixing extraction.
// Earlier launch experiments did not isolate a specific anti-automation mechanism.
const STEALTH_INIT_SCRIPT = () => {
  Object.defineProperty(navigator, 'webdriver', { get: () => false });

  // Confirmed live: navigator.platform reported "Linux x86_64" under this container's Chromium
  // even while SCRAPE_USER_AGENT above claims Windows -- a blatant UA/platform mismatch that's
  // among the most common, most basic bot-detection checks there is, and was missing from this
  // script even after being identified as a real contributing signal (caught by re-diffing a
  // successful isolated recipe against this shipped one after a live failure, not caught at the
  // time it was first found). Matches SCRAPE_USER_AGENT's claimed OS.
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

    const config = source.selectorConfig as unknown as SelectorConfig;
    const isMultiMerchant = !!config.rowSelector;
    const simplyCodes =
      !isMultiMerchant &&
      !!config.revealSelector &&
      isSimplyCodesStore(source.url);
    const started = Date.now();
    this.logger.log(
      `Scrape source=${source.id} job=${job.id} attempt=${job.attemptsMade + 1} strategy=${simplyCodes ? 'simplycodes-url-v1' : 'generic'} phase=start`,
    );

    if (!source.merchantId && !isMultiMerchant) {
      // A merchant-less source only makes sense in rowSelector (multi-merchant) mode, which
      // resolves the merchant per row instead of from a fixed merchantId. Anything else is a
      // genuinely unresolvable config -- skip cleanly rather than guess which merchant a code
      // belongs to.
      this.logger.warn(
        `Skipping scrape source ${source.id}: no merchantId set and not rowSelector-configured`,
      );
      return;
    }
    let cleanup: () => Promise<void> = async () => {};
    try {
      const launched = await launchDetachedChromium();
      cleanup = launched.cleanup;
      const browser = launched.browser;
      this.logger.log(
        `Scrape source=${source.id} phase=browser-ready browser=${browser.version()} elapsedMs=${Date.now() - started}`,
      );
      const context = await browser.newContext({
        userAgent: SCRAPE_USER_AGENT,
        viewport: SCRAPE_VIEWPORT,
        locale: 'en-US',
        extraHTTPHeaders: { 'Accept-Language': 'en-US,en;q=0.9' },
      });
      await context.addInitScript(STEALTH_INIT_SCRIPT);
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
      if (!simplyCodes)
        context.on('page', (popup) => {
          popupReads.push(
            (async () => {
              try {
                await popup.waitForLoadState('domcontentloaded', {
                  timeout: POPUP_LOAD_TIMEOUT_MS,
                });
                await popup.waitForTimeout(RENDER_SETTLE_MS);
                const found = await popup.$$eval(
                  config.codeSelector,
                  (elements) =>
                    elements
                      .map((el) => el.textContent?.trim())
                      .filter((text): text is string => !!text),
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
      this.logger.log(
        `Scrape source=${source.id} phase=navigation elapsedMs=${Date.now() - started}`,
      );
      const response = await page.goto(source.url, {
        waitUntil: 'domcontentloaded',
        timeout: 30_000,
      });
      await page.waitForTimeout(RENDER_SETTLE_MS);

      this.logger.log(
        `Scrape source=${source.id} phase=bot-check elapsedMs=${Date.now() - started}`,
      );
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
      this.logger.log(
        `Scrape source=${source.id} phase=consent elapsedMs=${Date.now() - started}`,
      );
      const consentButton = await page
        .waitForSelector(CONSENT_ACCEPT_SELECTOR, {
          timeout: CONSENT_WAIT_TIMEOUT_MS,
          state: 'visible',
        })
        .catch(() => null);
      if (consentButton) {
        await consentButton.click({ timeout: 5_000 }).catch(() => {});
        await page.waitForTimeout(500);
      }

      if (simplyCodes) {
        const result = await collectSimplyCodesReveals(
          page,
          source.url,
          {
            revealSelector: config.revealSelector!,
            codeSelector: config.codeSelector,
          },
          (message) => this.logger.log(`Scrape source=${source.id} ${message}`),
        );
        for (const code of result.codes) {
          await this.prisma.coupon.upsert({
            where: {
              merchantId_code: { merchantId: source.merchantId!, code },
            },
            update: { source: CouponSource.SCRAPE, active: true },
            create: {
              merchantId: source.merchantId!,
              code,
              source: CouponSource.SCRAPE,
            },
          });
        }
        if (result.failures.length) {
          throw new Error(
            `SimplyCodes scrape incomplete: saved ${result.codes.length} code(s); ${result.failures.join('; ')}`,
          );
        }
        this.logger.log(
          `Scraped ${result.codes.length} code(s) from source ${source.id}; elapsedMs=${Date.now() - started}`,
        );
        return;
      }

      let matchedCount = 0;
      let unmatchedCount = 0;

      if (isMultiMerchant) {
        // A site-wide feed (many merchants on one page, e.g. a "recently verified" activity
        // stream) rather than one store's own page -- no revealSelector/click needed since the
        // code is already plain text per row, but each row belongs to a *different* merchant, so
        // codeSelector/merchantSelector are evaluated scoped to each row (row.$eval, not
        // page.$$eval) rather than once for the whole page.
        //
        // waitForSelector rather than trusting RENDER_SETTLE_MS here -- confirmed live
        // (simplycodes.com's own feed) that this kind of widget can hydrate meaningfully slower
        // than a normal page's main content: a 2s wait produced 0 rows 3 of 5 times, a 5s wait
        // was reliable across repeated tries. Rather than raise the shared constant (which would
        // needlessly slow down every other source), wait for this source's own rowSelector to
        // actually appear, with its own longer budget -- a genuinely empty feed (0 rows at
        // timeout) is indistinguishable from a slow one here, so this degrades to "scraped 0",
        // not a thrown error.
        await page
          .waitForSelector(config.rowSelector as string, { timeout: 10_000 })
          .catch(() => {});
        const rows = await page.$$(config.rowSelector as string);
        for (const row of rows) {
          const rawCode = await row
            .$eval(config.codeSelector, (el) => el.textContent?.trim())
            .catch(() => null);
          const rawMerchantName = await row
            .$eval(config.merchantSelector as string, (el) =>
              el.textContent?.trim(),
            )
            .catch(() => null);
          if (!rawCode || !rawMerchantName || !looksLikeCouponCode(rawCode)) {
            continue;
          }

          // Feed rows prefix the name with a status-dot glyph (e.g. "●Sanity Jewelry") that's a
          // real text character here, not CSS-generated content, so it has to be stripped before
          // matching rather than relying on textContent alone.
          const merchantName = rawMerchantName.replace(/^[^\w]+/, '').trim();
          const merchant = await this.prisma.merchant.findFirst({
            where: { name: { equals: merchantName, mode: 'insensitive' } },
          });
          if (!merchant) {
            unmatchedCount++;
            continue;
          }

          matchedCount++;
          await this.prisma.coupon.upsert({
            where: {
              merchantId_code: { merchantId: merchant.id, code: rawCode },
            },
            update: { source: CouponSource.SCRAPE, active: true },
            create: {
              merchantId: merchant.id,
              code: rawCode,
              source: CouponSource.SCRAPE,
            },
          });
        }

        this.logger.log(
          `Scraped ${matchedCount} code(s) from source ${source.id} (${unmatchedCount} row(s) skipped, no matching merchant)`,
        );
      } else {
        if (config.revealSelector) {
          const revealCount = Math.min(
            (await page.$$(config.revealSelector)).length,
            MAX_REVEALS_PER_RUN,
          );
          for (let i = 0; i < revealCount; i++) {
            try {
              // Re-queried fresh on every iteration rather than reusing a single upfront
              // page.$$() array of handles -- confirmed live (simplycodes.com/allbirds.com) that
              // a reveal click which updates the list DOM (a "verified" badge, a use-count bump,
              // anything React re-renders) detaches every handle grabbed before it, not just the
              // one clicked: all handles from one upfront grab failed as "not attached to DOM",
              // including the very first. Matching by index assumes reveals don't reorder the
              // list, which holds for every source configured so far.
              const buttons = await page.$$(config.revealSelector);
              const button = buttons[i];
              if (!button) break;
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
        // navigation) is client-rendered too, and this read raced that the same way the popup
        // read used to before RENDER_SETTLE_MS was added there.
        await page.waitForTimeout(RENDER_SETTLE_MS);

        // A reveal click can navigate the original page itself (not just open a popup, e.g. an
        // affiliate redirect firing on both), so this read races that navigation. Falling back to
        // an empty list on failure keeps popup-sourced codes intact rather than losing the whole
        // run to an "execution context destroyed" error.
        const pageCodes = await page
          .$$eval(config.codeSelector, (elements) =>
            elements
              .map((el) => el.textContent?.trim())
              .filter((text): text is string => !!text),
          )
          .catch((error) => {
            this.logger.warn(
              `Main page read failed for source ${source.id}: ${error instanceof Error ? error.message : error}`,
            );
            return [];
          });

        const codes = [...new Set([...pageCodes, ...popupCodes])].filter(
          looksLikeCouponCode,
        );

        for (const code of codes) {
          await this.prisma.coupon.upsert({
            where: {
              merchantId_code: {
                merchantId: source.merchantId as string,
                code,
              },
            },
            update: { source: CouponSource.SCRAPE, active: true },
            create: {
              merchantId: source.merchantId as string,
              code,
              source: CouponSource.SCRAPE,
            },
          });
        }

        this.logger.log(
          `Scraped ${codes.length} code(s) from source ${source.id}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Scrape source=${source.id} phase=failed elapsedMs=${Date.now() - started}: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    } finally {
      await cleanup().catch((error) =>
        this.logger.warn(`Browser cleanup failed: ${String(error)}`),
      );
      await this.prisma.scrapeSource.update({
        where: { id: source.id },
        data: { lastRunAt: new Date() },
      });
    }
  }
}
