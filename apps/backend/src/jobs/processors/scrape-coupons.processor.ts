import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { CouponSource } from '@prisma/client';
import { Job } from 'bullmq';
import { chromium } from 'playwright';
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

// Coupon aggregator sites (RetailMeNot, etc.) put pages behind bot-detection challenges that key
// off Playwright/Puppeteer's default headless fingerprint (an explicit "HeadlessChrome" UA and a
// telltale default viewport). Presenting an ordinary desktop-Chrome UA/viewport/locale -- the same
// thing every real visitor's browser sends -- is enough to pass; this isn't fingerprint spoofing
// beyond that, and we don't attempt to solve the interactive challenge itself.
const SCRAPE_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const SCRAPE_VIEWPORT = { width: 1366, height: 900 };

// A best-effort shape check, not a guarantee: real coupon codes are near-universally uppercase
// alphanumeric with no spaces, which filters out prose-like junk (button labels, nav items) that
// can otherwise slip through a codeSelector match -- especially after a reveal click, where sites
// that open a popup tend to reload their whole page rather than just the one revealed offer (see
// the popup-handling comment below). It can't distinguish a real code from an unrelated word that
// happens to already be all-caps (e.g. a "STYLE" category label) -- selector precision still does
// most of the real work; this only catches what selectors can't.
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
      await page.goto(source.url, { waitUntil: 'domcontentloaded', timeout: 30_000 });

      // Sites running the OneTrust consent manager (RetailMeNot among them) show a full-page
      // backdrop until it's dismissed, which sits on top of everything else and silently times
      // out any click underneath it -- including reveal buttons, with no error indicating why.
      // Its accept button id is a OneTrust-wide constant, not something we can page-config: dismiss
      // it opportunistically for every source; it's simply absent on sites that don't run OneTrust.
      const consentButton = await page.$('#onetrust-accept-btn-handler');
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
