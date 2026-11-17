import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ScrapeSource } from '@prisma/client';
import { PublicPage } from '../common/http/fetch-public-page';
import { couponFollowScraper } from './couponfollow.scraper';
import { HttpFetcher, ScrapeContext } from './coupon-site.types';

const STORE = 'https://couponfollow.com/site/allbirds.com';
const API = 'https://couponfollow.com/api/v1/public/offer/modal/allbirds.com';
const fixture = (name: string) =>
  readFileSync(join(__dirname, 'fixtures', name), 'utf8');

// Shaped like the live API's answer for C5698579 on 2026-11-17, other fields trimmed.
function offer(id: string, overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    $type: 'merchant',
    isExpired: false,
    offerId: id,
    title: 'Allbirds Promo Code: Get 15% Off Your Order',
    description:
      'Redeem this promo code at checkout and save 15% on your order.',
    code: 'WELCOME10',
    retailerUrl: `https://click.couponfollow.com/click?pwk=df1234&dn=allbirds.com&r=cc%2f${id.slice(1)}`,
    discountInfo: { text: '15%', type: 'PercentageReduction', value: 15 },
    ...overrides,
  });
}

const page = (status: number, body: string): PublicPage => ({
  url: '',
  status,
  headers: {},
  body,
});

function context(responses: Record<string, PublicPage>) {
  const calls: { url: string; headers?: Record<string, string> }[] = [];
  const fetch: HttpFetcher = async (url, headers) => {
    calls.push({ url, headers });
    const response = responses[url];
    if (!response) throw new Error(`unexpected request ${url}`);
    return response;
  };
  const sleep = jest.fn(async () => {});
  const ctx: ScrapeContext = {
    source: { url: STORE } as ScrapeSource,
    log: () => {},
    browser: () => {
      throw new Error('CouponFollow must not start a browser');
    },
    fetch,
    sleep,
  };
  return { ctx, calls, sleep };
}

describe('CouponFollow scraper', () => {
  const store = page(200, fixture('couponfollow-store.html'));

  it('reads each coupon offer from the JSON its own popup uses, without a browser', async () => {
    const { ctx, calls, sleep } = context({
      [STORE]: store,
      [`${API}/C5698579`]: page(200, offer('C5698579')),
      [`${API}/C5484523`]: page(
        200,
        offer('C5484523', {
          code: 'Blake15',
          description: '',
          title: '15% off with code',
          discountInfo: null,
        }),
      ),
      [`${API}/C5471050`]: page(
        200,
        offer('C5471050', { code: 'OLD20', isExpired: true }),
      ),
      [`${API}/C5400000`]: page(
        200,
        offer('C5400000', {
          code: 'ELSEWHERE',
          retailerUrl:
            'https://click.couponfollow.com/click?pwk=df1234&dn=other.com&r=cc%2f5400000',
        }),
      ),
    });

    const outcome = await couponFollowScraper.scrape(ctx);

    expect(outcome).toEqual({
      kind: 'codes',
      failures: [],
      offers: [
        {
          code: 'WELCOME10',
          description:
            'Redeem this promo code at checkout and save 15% on your order.',
          discountType: 'percent',
          discountValue: 15,
          expired: false,
        },
        // Mixed case kept; the title stands in for an empty description.
        { code: 'Blake15', description: '15% off with code', expired: false },
        {
          code: 'OLD20',
          description:
            'Redeem this promo code at checkout and save 15% on your order.',
          discountType: 'percent',
          discountValue: 15,
          expired: true,
        },
      ],
    });
    // Only "C" coupons with a code, each once, never the affiliate click links.
    expect(calls.map((c) => c.url)).toEqual([
      STORE,
      `${API}/C5698579`,
      `${API}/C5484523`,
      `${API}/C5471050`,
      `${API}/C5400000`,
    ]);
    expect(calls.some((c) => c.url.includes('click.couponfollow.com'))).toBe(
      false,
    );
    expect(calls[1].headers).toMatchObject({
      Accept: 'application/json',
      Referer: STORE,
    });
    expect(sleep).toHaveBeenCalledTimes(3);
  });

  it('reports a store CouponFollow does not list', async () => {
    const { ctx } = context({ [STORE]: page(404, '<title>Page not found') });
    await expect(couponFollowScraper.scrape(ctx)).resolves.toEqual({
      kind: 'not_listed',
    });
  });

  it('reports a block on the store page instead of zero codes', async () => {
    const { ctx, calls } = context({
      [STORE]: page(403, fixture('couponfollow-blocked.html')),
    });
    await expect(couponFollowScraper.scrape(ctx)).resolves.toEqual({
      kind: 'blocked',
      reason: 'page title matched "just a moment"',
    });
    expect(calls).toHaveLength(1);
  });

  it('keeps codes read before a mid-run block and stops asking', async () => {
    const { ctx, calls } = context({
      [STORE]: store,
      [`${API}/C5698579`]: page(200, offer('C5698579')),
      [`${API}/C5484523`]: page(429, 'Too Many Requests'),
    });
    const outcome = await couponFollowScraper.scrape(ctx);
    expect(outcome).toMatchObject({
      kind: 'codes',
      offers: [{ code: 'WELCOME10' }],
      failures: ['Blocked after 1 offer(s) (HTTP 429)'],
    });
    expect(calls).toHaveLength(3);
  });

  it('fails visibly when the page no longer has offer cards', async () => {
    const { ctx } = context({
      [STORE]: page(200, '<html><title>Allbirds</title><body></body></html>'),
    });
    await expect(couponFollowScraper.scrape(ctx)).resolves.toEqual({
      kind: 'codes',
      offers: [],
      failures: [
        'No offers on the store page; CouponFollow may have changed its layout',
      ],
    });
  });

  it('refuses a URL that is not a CouponFollow store page', async () => {
    const { ctx } = context({});
    ctx.source.url = 'https://couponfollow.com/deals';
    await expect(couponFollowScraper.scrape(ctx)).rejects.toThrow(
      'Not a CouponFollow store page',
    );
  });
});
