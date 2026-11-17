import { ScrapeStrategy } from '@prisma/client';
import { collectSimplyCodesReveals } from '../jobs/processors/simplycodes-reveals';
import {
  CouponSiteScraper,
  ScrapeContext,
  ScrapeOutcome,
} from './coupon-site.types';

// Confirmed on a live store page (2026-11-17): every offer's "Show Code" button is
// `button.btn-show-code` carrying `data-code`, and the reveal modal shows `#sc-modal-code`.
// A source's own selectorConfig (sources migrated from hand-made ones) overrides these.
export const SIMPLYCODES_SELECTORS = {
  revealSelector: '.btn-show-code',
  codeSelector: '#sc-modal-code',
};

/** SimplyCodes sits behind Cloudflare, which turns away plain HTTP, so it needs the browser. */
export const simplyCodesScraper: CouponSiteScraper = {
  key: ScrapeStrategy.SIMPLYCODES,
  fetchMode: 'browser',
  spacingMs: 0, // the browser queue already runs one job at a time
  emptyIsFailure: false,
  async scrape(ctx: ScrapeContext): Promise<ScrapeOutcome> {
    const overrides = (ctx.source.selectorConfig ?? {}) as Partial<
      typeof SIMPLYCODES_SELECTORS
    >;
    const selectors = {
      revealSelector:
        overrides.revealSelector || SIMPLYCODES_SELECTORS.revealSelector,
      codeSelector:
        overrides.codeSelector || SIMPLYCODES_SELECTORS.codeSelector,
    };
    const session = await ctx.browser();
    ctx.log(`browser=${session.browserVersion}`);
    const opened = await session.open(ctx.source.url);
    if (opened.blocked) return { kind: 'blocked', reason: opened.blocked };
    if (opened.status === 404) return { kind: 'not_listed' };
    const result = await collectSimplyCodesReveals(
      session.page,
      ctx.source.url,
      selectors,
      ctx.log,
    );
    return {
      kind: 'codes',
      offers: result.codes.map((code) => ({ code })),
      failures: result.failures,
    };
  },
};
