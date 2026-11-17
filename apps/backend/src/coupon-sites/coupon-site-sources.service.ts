import { Injectable, Logger } from '@nestjs/common';
import { ScrapeSourceStatus, ScrapeStrategy } from '@prisma/client';
import {
  COUPON_SITES,
  CouponSiteInfo,
  couponSiteStoreUrl,
} from '@saverlly/shared-types';
import { PrismaService } from '../prisma/prisma.service';

/** A new merchant's first runs are spread over this long, not fired at once. */
export const NEW_MERCHANT_SPREAD_MS = 60 * 60_000;
/** A backfill's first runs are spread over a day, so the coupon sites see a trickle. */
export const BACKFILL_SPREAD_MS = 24 * 60 * 60_000;
const BACKFILL_BATCH = 200;

/**
 * Coupon sites switched off everywhere by COUPON_SITES_DISABLED (comma-separated strategies,
 * e.g. "COUPONFOLLOW"). Their sources are neither created nor run; switching a site back on
 * needs only the variable changed and a restart, no deploy.
 */
export function disabledCouponSites(
  env: NodeJS.ProcessEnv = process.env,
): ScrapeStrategy[] {
  const known = new Set<string>(COUPON_SITES.map((site) => site.strategy));
  return (env.COUPON_SITES_DISABLED ?? '')
    .split(',')
    .map((name) => name.trim().toUpperCase())
    .filter((name) => known.has(name)) as ScrapeStrategy[];
}

export function enabledCouponSites(
  env: NodeJS.ProcessEnv = process.env,
): CouponSiteInfo[] {
  const disabled = new Set<string>(disabledCouponSites(env));
  return COUPON_SITES.filter((site) => !disabled.has(site.strategy));
}

/** Keeps every merchant's sources on the built-in coupon sites in place. */
@Injectable()
export class CouponSiteSourcesService {
  private readonly logger = new Logger(CouponSiteSourcesService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Creates the merchant's missing coupon site sources, active, first run within `spreadMs`.
   * A source that already exists is left exactly as it is, so an admin who switched one off
   * keeps it off, and calling this again creates nothing.
   */
  async ensureForMerchant(
    merchant: { id: string; domain: string },
    spreadMs = NEW_MERCHANT_SPREAD_MS,
    now = Date.now(),
  ): Promise<number> {
    const sites = enabledCouponSites();
    if (!sites.length) return 0;
    // ON CONFLICT DO NOTHING against the one-source-per-site partial unique index.
    const { count } = await this.prisma.scrapeSource.createMany({
      data: sites.map((site) => ({
        strategy: site.strategy,
        merchantId: merchant.id,
        url: couponSiteStoreUrl(site.strategy, merchant.domain),
        intervalMinutes: site.defaultIntervalMinutes,
        autoCreated: true,
        nextRunAt: new Date(now + Math.floor(Math.random() * spreadMs)),
      })),
      skipDuplicates: true,
    });
    return count;
  }

  /**
   * A merchant's domain changed: its coupon site pages move with it. Only sources still on the
   * page built from the old domain follow; one an admin pointed elsewhere keeps its URL. They
   * start over as ACTIVE, since the new domain may be listed where the old one wasn't.
   */
  async moveToDomain(
    merchantId: string,
    oldDomain: string,
    newDomain: string,
  ): Promise<void> {
    for (const site of COUPON_SITES) {
      await this.prisma.scrapeSource.updateMany({
        where: {
          merchantId,
          strategy: site.strategy,
          url: couponSiteStoreUrl(site.strategy, oldDomain),
        },
        data: {
          url: couponSiteStoreUrl(site.strategy, newDomain),
          status: ScrapeSourceStatus.ACTIVE,
          consecutiveFailures: 0,
          nextRunAt: new Date(
            Date.now() + Math.floor(Math.random() * NEW_MERCHANT_SPREAD_MS),
          ),
        },
      });
    }
  }

  /** Gives every active merchant its coupon site sources. Safe to run any number of times. */
  async backfill(): Promise<{ merchants: number; created: number }> {
    const now = Date.now();
    let merchants = 0;
    let created = 0;
    let cursor: string | undefined;
    for (;;) {
      const batch = await this.prisma.merchant.findMany({
        where: { active: true },
        select: { id: true, domain: true },
        orderBy: { id: 'asc' },
        take: BACKFILL_BATCH,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      });
      if (!batch.length) break;
      for (const merchant of batch)
        created += await this.ensureForMerchant(
          merchant,
          BACKFILL_SPREAD_MS,
          now,
        );
      merchants += batch.length;
      cursor = batch.at(-1)!.id;
    }
    this.logger.log(
      `Coupon site backfill: ${created} source(s) for ${merchants} merchant(s)`,
    );
    return { merchants, created };
  }
}
