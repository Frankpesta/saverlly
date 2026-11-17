import { Injectable } from '@nestjs/common';
import { ScrapeSource, ScrapeStrategy } from '@prisma/client';
import { CouponSiteScraper } from './coupon-site.types';
import { couponFollowScraper } from './couponfollow.scraper';
import { genericCssScraper } from './generic-css.scraper';
import { simplyCodesScraper } from './simplycodes.scraper';
import { isSimplyCodesStore } from '../jobs/processors/simplycodes-reveals';

const SCRAPERS: Record<ScrapeStrategy, CouponSiteScraper> = {
  GENERIC_CSS: genericCssScraper,
  SIMPLYCODES: simplyCodesScraper,
  COUPONFOLLOW: couponFollowScraper,
};

@Injectable()
export class CouponSiteRegistry {
  /** The scraper that reads this source. */
  forSource(
    source: Pick<ScrapeSource, 'strategy' | 'url' | 'selectorConfig'>,
  ): CouponSiteScraper {
    if (source.strategy === ScrapeStrategy.GENERIC_CSS) {
      // A hand-made SimplyCodes store source that the migration couldn't move (a second one for
      // the same merchant) keeps the SimplyCodes collector it used before, selectors included.
      const config = (source.selectorConfig ?? {}) as {
        revealSelector?: string;
        rowSelector?: string;
      };
      if (
        config.revealSelector &&
        !config.rowSelector &&
        isSimplyCodesStore(source.url)
      )
        return simplyCodesScraper;
    }
    return SCRAPERS[source.strategy];
  }
}
