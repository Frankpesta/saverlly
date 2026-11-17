import { ScrapeSource, ScrapeStrategy } from '@prisma/client';
import { PublicPage } from '../common/http/fetch-public-page';
import { BrowserSession } from './browser-session';

export interface ScrapedOffer {
  /** Case preserved. */
  code: string;
  description?: string;
  discountType?: 'percent' | 'fixed';
  discountValue?: number;
  /** The site marks the offer expired. Logged, never saved. */
  expired?: boolean;
  /** Multi-merchant feeds only: the store name as the page shows it. */
  merchantName?: string;
}

export type ScrapeOutcome =
  | {
      kind: 'codes';
      offers: ScrapedOffer[];
      /** Parts of the page that could not be read. Codes found are still saved, then the run
       *  fails so BullMQ retries it. */
      failures?: string[];
    }
  /** The site has no page for this store. */
  | { kind: 'not_listed' }
  /** The site's bot protection turned us away. Never worked around. */
  | { kind: 'blocked'; reason: string };

export type HttpFetcher = (
  url: string,
  headers?: Record<string, string>,
) => Promise<PublicPage>;

export interface ScrapeContext {
  source: ScrapeSource;
  log: (message: string) => void;
  /** Browser scrapers only. Launched on first call, closed by the runner. */
  browser: () => Promise<BrowserSession>;
  fetch: HttpFetcher;
  sleep: (ms: number) => Promise<void>;
}

export interface CouponSiteScraper {
  /** Unique per scraper; GENERIC_CSS's SimplyCodes routing shares SIMPLYCODES's key. */
  key: ScrapeStrategy;
  fetchMode: 'http' | 'browser';
  /** Gap between two of this site's jobs queued in the same dispatcher tick. */
  spacingMs: number;
  /** Zero codes counts as a failed run (a configured page should always have some). */
  emptyIsFailure: boolean;
  scrape(ctx: ScrapeContext): Promise<ScrapeOutcome>;
}
