import { ScrapeStrategy } from '@prisma/client';
import { RENDER_SETTLE_MS } from './browser-session';
import {
  CouponSiteScraper,
  ScrapeContext,
  ScrapeOutcome,
  ScrapedOffer,
} from './coupon-site.types';

export interface SelectorConfig {
  codeSelector: string;
  descriptionSelector?: string;
  revealSelector?: string;
  rowSelector?: string;
  merchantSelector?: string;
}

// Bounds how many reveal buttons a single run will click, so a page with an unexpectedly large
// offer list can't turn one scheduled job into an unbounded run.
const MAX_REVEALS_PER_RUN = 25;
const REVEAL_CLICK_DELAY_MS = 300;
const POPUP_LOAD_TIMEOUT_MS = 8_000;

// A best-effort shape check, not a guarantee: codes on admin-configured pages are near-universally
// uppercase alphanumeric, which filters out prose-like junk (button labels, nav items) a broad
// codeSelector can also match, especially after a reveal reloads the page. Deliberately
// case-sensitive for that reason; the built-in site scrapers read codes from structured data and
// keep mixed case.
export function looksLikeCouponCode(text: string): boolean {
  return /^[A-Z0-9-]{3,20}$/.test(text);
}

/** The admin-configured selector scraper: one store page, or a multi-merchant feed. */
export const genericCssScraper: CouponSiteScraper = {
  key: ScrapeStrategy.GENERIC_CSS,
  fetchMode: 'browser',
  spacingMs: 0,
  emptyIsFailure: true,
  async scrape(ctx: ScrapeContext): Promise<ScrapeOutcome> {
    const config = ctx.source.selectorConfig as unknown as SelectorConfig;
    const session = await ctx.browser();
    const failures: string[] = [];

    // "Get code" buttons sometimes open a new tab instead of revealing in place: an affiliate
    // redirect (nothing matches, closed unread) or the code itself on a permalink of the same
    // listing. Each popup is read in the background and collected in popupReads, awaited below,
    // so popup-only codes aren't lost when the main read finishes first.
    const popupCodes: string[] = [];
    const popupReads: Promise<void>[] = [];
    if (!config.rowSelector)
      session.context.on('page', (popup) => {
        popupReads.push(
          (async () => {
            try {
              await popup.waitForLoadState('domcontentloaded', {
                timeout: POPUP_LOAD_TIMEOUT_MS,
              });
              await popup.waitForTimeout(RENDER_SETTLE_MS);
              popupCodes.push(
                ...(await popup.$$eval(config.codeSelector, (elements) =>
                  elements
                    .map((el) => el.textContent?.trim())
                    .filter((text): text is string => !!text),
                )),
              );
            } catch (error) {
              failures.push('Popup extraction failed');
              ctx.log(`popup read failed: ${String(error)}`);
            } finally {
              await popup.close().catch(() => {});
            }
          })(),
        );
      });

    const opened = await session.open(ctx.source.url);
    if (opened.blocked) return { kind: 'blocked', reason: opened.blocked };
    const page = session.page;

    if (config.rowSelector) {
      // A site-wide feed: each row is a different merchant, so selectors are scoped per row and
      // the runner resolves merchants by name. Wait for the rows themselves: such widgets were
      // confirmed live to hydrate slower than a normal page's content.
      await page
        .waitForSelector(config.rowSelector, { timeout: 10_000 })
        .catch(() => {
          failures.push(
            'No feed rows appeared; verify selectors or source availability',
          );
        });
      const offers: ScrapedOffer[] = [];
      for (const row of await page.$$(config.rowSelector)) {
        const rawCode = await row
          .$eval(config.codeSelector, (el) => el.textContent?.trim())
          .catch(() => null);
        const rawMerchantName = await row
          .$eval(config.merchantSelector as string, (el) =>
            el.textContent?.trim(),
          )
          .catch(() => null);
        if (!rawCode || !rawMerchantName || !looksLikeCouponCode(rawCode)) {
          failures.push(
            'Feed row is missing a valid code or merchant selector match',
          );
          continue;
        }
        // Feed rows prefix the name with a status-dot glyph (e.g. "●Sanity Jewelry").
        offers.push({
          code: rawCode,
          merchantName: rawMerchantName.replace(/^[^\w]+/, '').trim(),
        });
      }
      return { kind: 'codes', offers, failures };
    }

    if (config.revealSelector) {
      const revealCount = Math.min(
        (await page.$$(config.revealSelector)).length,
        MAX_REVEALS_PER_RUN,
      );
      if (!revealCount)
        failures.push('Configured reveal selector matched no buttons');
      for (let i = 0; i < revealCount; i++) {
        try {
          // Re-queried every iteration: a reveal that re-renders the list detaches every handle
          // grabbed before it (confirmed live), not just the one clicked.
          const button = (await page.$$(config.revealSelector))[i];
          if (!button) break;
          await button.click({ timeout: 5_000 });
          await page.waitForTimeout(REVEAL_CLICK_DELAY_MS);
        } catch (error) {
          failures.push('Reveal click failed');
          ctx.log(`reveal click failed: ${String(error)}`);
        }
      }
    }

    await Promise.all(popupReads);
    // A reveal that updates codes in place is client-rendered too.
    await page.waitForTimeout(RENDER_SETTLE_MS);

    // A reveal can navigate the page itself, so this read can race that navigation; falling back
    // to [] keeps popup-sourced codes instead of losing the whole run.
    const pageCodes = await page
      .$$eval(config.codeSelector, (elements) =>
        elements
          .map((el) => el.textContent?.trim())
          .filter((text): text is string => !!text),
      )
      .catch((error) => {
        failures.push('Main page extraction failed');
        ctx.log(`main page read failed: ${String(error)}`);
        return [] as string[];
      });

    const codes = [...new Set([...pageCodes, ...popupCodes])].filter(
      looksLikeCouponCode,
    );
    return {
      kind: 'codes',
      offers: codes.map((code) => ({ code })),
      failures,
    };
  },
};
