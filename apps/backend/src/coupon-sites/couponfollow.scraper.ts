import { ScrapeStrategy } from '@prisma/client';
import { couponSiteDomain } from '@saverlly/shared-types';
import { load } from 'cheerio';
import { botWallInHtml } from './browser-session';
import {
  CouponSiteScraper,
  ScrapeContext,
  ScrapeOutcome,
  ScrapedOffer,
} from './coupon-site.types';

// Confirmed live (2026-11-17, allbirds.com and gymshark.com): the store page lists each offer as
// `article[data-offer-id]`; coupons have ids "C<digits>" and `data-has-code="true"`. The code is
// not in the page: the page's own "Show code" popup fetches it as JSON from
// /api/v1/public/offer/modal/{domain}/{offerId}. Reading that JSON needs no browser and, unlike
// the "Get code" links, never goes through the click.couponfollow.com affiliate redirect, so a
// run generates no affiliate clicks. Only "C" ids are read: other offer kinds (promotions,
// cashback, single-use codes) are not shared codes.
const STORE_PAGE = /^https:\/\/couponfollow\.com\/site\/([^/?#]+)\/?$/;
const OFFER_ID = /^C\d{1,12}$/;
const CODE = /^[A-Za-z0-9_-]{3,64}$/;
const MAX_OFFERS_PER_RUN = 25;
// One offer request a second per store, so a run reads like a person opening a few codes.
const OFFER_DELAY_MS = 1_000;
const API = 'https://couponfollow.com/api/v1/public/offer/modal';

interface OfferJson {
  offerId?: unknown;
  code?: unknown;
  title?: unknown;
  description?: unknown;
  isExpired?: unknown;
  retailerUrl?: unknown;
  popupRetailerUrl?: unknown;
  discountInfo?: { type?: unknown; value?: unknown } | null;
}

function discount(
  info: OfferJson['discountInfo'],
): Pick<ScrapedOffer, 'discountType' | 'discountValue'> {
  const value = typeof info?.value === 'number' ? info.value : NaN;
  const type = typeof info?.type === 'string' ? info.type : '';
  if (!(value > 0)) return {};
  if (/percent/i.test(type))
    return { discountType: 'percent', discountValue: value };
  if (/amount|fixed|dollar|money|currency/i.test(type))
    return { discountType: 'fixed', discountValue: value };
  return {};
}

/** The store an offer's own retailer link points at (its `dn` parameter), if it says. */
function offerStore(json: OfferJson): string | null {
  for (const link of [json.retailerUrl, json.popupRetailerUrl]) {
    if (typeof link !== 'string') continue;
    try {
      const dn = new URL(link).searchParams.get('dn');
      if (dn) return couponSiteDomain(dn);
    } catch {
      // not a URL; try the next one
    }
  }
  return null;
}

export const couponFollowScraper: CouponSiteScraper = {
  key: ScrapeStrategy.COUPONFOLLOW,
  fetchMode: 'http',
  spacingMs: 30_000,
  emptyIsFailure: false,
  async scrape(ctx: ScrapeContext): Promise<ScrapeOutcome> {
    const match = STORE_PAGE.exec(ctx.source.url);
    if (!match)
      throw new Error(
        `Not a CouponFollow store page (expected https://couponfollow.com/site/<domain>): ${ctx.source.url}`,
      );
    const domain = couponSiteDomain(decodeURIComponent(match[1]));

    const listing = await ctx.fetch(ctx.source.url);
    if (listing.status === 404) return { kind: 'not_listed' };
    const wall = botWallInHtml(listing.status, listing.body);
    if (wall) return { kind: 'blocked', reason: wall };
    if (listing.status !== 200)
      throw new Error(`Store page answered HTTP ${listing.status}`);

    const $ = load(listing.body);
    const articles = $('article[data-offer-id]');
    if (!articles.length)
      return {
        kind: 'codes',
        offers: [],
        failures: [
          'No offers on the store page; CouponFollow may have changed its layout',
        ],
      };
    const ids = [
      ...new Set(
        articles
          .filter((_, el) => $(el).attr('data-has-code') === 'true')
          .map((_, el) => $(el).attr('data-offer-id') ?? '')
          .get()
          .filter((id) => OFFER_ID.test(id)),
      ),
    ].slice(0, MAX_OFFERS_PER_RUN);
    ctx.log(`offers=${articles.length} withCodes=${ids.length}`);

    const offers: ScrapedOffer[] = [];
    const failures: string[] = [];
    for (const [index, id] of ids.entries()) {
      if (index) await ctx.sleep(OFFER_DELAY_MS);
      const response = await ctx.fetch(`${API}/${domain}/${id}`, {
        Accept: 'application/json',
        Referer: ctx.source.url,
      });
      const blocked = botWallInHtml(response.status, response.body);
      if (blocked) {
        if (!offers.length) return { kind: 'blocked', reason: blocked };
        failures.push(`Blocked after ${offers.length} offer(s) (${blocked})`);
        break;
      }
      if (response.status !== 200) {
        failures.push(`Offer ${id} answered HTTP ${response.status}`);
        continue;
      }
      let json: OfferJson;
      try {
        json = JSON.parse(response.body) as OfferJson;
      } catch {
        failures.push(`Offer ${id} was not JSON`);
        continue;
      }
      const store = offerStore(json);
      if (json.offerId !== id || (store && store !== domain)) {
        ctx.log(`offer ${id} skipped: belongs to ${store ?? 'another offer'}`);
        continue;
      }
      const code = typeof json.code === 'string' ? json.code.trim() : '';
      if (!CODE.test(code)) continue;
      const description =
        typeof json.description === 'string' && json.description.trim()
          ? json.description.trim()
          : typeof json.title === 'string'
            ? json.title.trim()
            : undefined;
      offers.push({
        code,
        description: description?.slice(0, 500),
        ...discount(json.discountInfo),
        expired: json.isExpired === true,
      });
    }
    return { kind: 'codes', offers, failures };
  },
};
