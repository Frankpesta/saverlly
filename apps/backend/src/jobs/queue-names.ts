export const QUEUE_NAMES = {
  // Retired: held one repeat job per scrape source before the dispatcher. Kept only so boot can
  // clear what's left of it in Redis.
  SCRAPE_COUPONS: 'scrape-coupons',
  SCRAPE_DISPATCH: 'scrape-dispatch',
  SCRAPE_HTTP: 'scrape-http',
  SCRAPE_BROWSER: 'scrape-browser',
  SYNC_AFFILIATE_FEED: 'sync-affiliate-feed',
  SYNC_COMMISSIONS: 'sync-commissions',
  GENERATE_PAYOUTS: 'generate-payouts',
  SEND_EMAIL: 'send-email',
  COMMISSION_DIGEST: 'commission-digest',
} as const;
