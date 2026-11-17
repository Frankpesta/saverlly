// Coupon sites with a built-in scraper. The backend registry and the dashboard's source form both
// read this list, so a site is added in one place. Store pages are addressed by the store's own
// domain (Merchant.domain), so no per-merchant slug is needed.

export type CouponSiteStrategy = 'SIMPLYCODES' | 'COUPONFOLLOW';
export type ScrapeStrategyName = 'GENERIC_CSS' | CouponSiteStrategy;
export type ScrapeSourceStatusName = 'ACTIVE' | 'NOT_LISTED' | 'BLOCKED';

export interface CouponSiteInfo {
  strategy: CouponSiteStrategy;
  label: string;
  /** 'http' sites are read without a browser; 'browser' sites need Chromium. */
  fetchMode: 'http' | 'browser';
  defaultIntervalMinutes: number;
  /** Store page address, with {domain} standing for the store's domain. */
  storeUrlTemplate: string;
}

export const COUPON_SITES: readonly CouponSiteInfo[] = [
  {
    strategy: 'SIMPLYCODES',
    label: 'SimplyCodes',
    fetchMode: 'browser',
    defaultIntervalMinutes: 1440,
    storeUrlTemplate: 'https://simplycodes.com/store/{domain}',
  },
  {
    strategy: 'COUPONFOLLOW',
    label: 'CouponFollow',
    fetchMode: 'http',
    defaultIntervalMinutes: 360,
    storeUrlTemplate: 'https://couponfollow.com/site/{domain}',
  },
];

export function couponSiteInfo(strategy: string): CouponSiteInfo | undefined {
  return COUPON_SITES.find((site) => site.strategy === strategy);
}

/** "WWW.Allbirds.com" -> "allbirds.com", the form coupon sites key their store pages by. */
export function couponSiteDomain(domain: string): string {
  return domain
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/[/?#].*$/, '')
    .replace(/^www\./, '');
}

export function couponSiteStoreUrl(
  strategy: CouponSiteStrategy,
  domain: string,
): string {
  const site = couponSiteInfo(strategy);
  if (!site) throw new Error(`Unknown coupon site ${strategy}`);
  return site.storeUrlTemplate.replace('{domain}', couponSiteDomain(domain));
}

/** A source failing this many runs in a row (blocks not counted) is flagged on the dashboard. */
export const SCRAPE_SOURCE_FAILING_AFTER = 5;

/** One row of the dashboard's coupon sites panel: the last 24 hours of runs for one scraper. */
export interface CouponSiteHealth {
  strategy: ScrapeStrategyName;
  label: string;
  runs: { succeeded: number; blocked: number; notListed: number; failed: number };
  codesFound: number;
  lastSucceededAt: string | null;
  /** Set while the whole site is paused after a burst of blocks. */
  pausedUntil: string | null;
}
