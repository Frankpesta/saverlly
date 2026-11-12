import { CouponSource } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { serializable } from '../common/prisma/serializable.util';
import { AffiliateCouponDto } from '../affiliate-adapters/affiliate-network-adapter.interface';
import { normalizeDiscountType } from './discount-type.util';

// How long a scraped/API code stays offered after a sync last saw it. Coupon sites block the
// scrapers often, so this is generous: a code isn't dropped just because one source went quiet.
// Migration 20261112120000_coupon_freshness_20_days gave every existing code 20 days from deploy.
export const COUPON_FRESHNESS_DAYS = 20;

export async function saveAutomatedCoupon(
  prisma: PrismaService,
  merchantId: string,
  coupon: AffiliateCouponDto,
  source: 'SCRAPE' | 'API',
  intervalMinutes = 1440,
): Promise<void> {
  const now = new Date();
  const freshUntil = new Date(
    now.getTime() +
      Math.max(COUPON_FRESHNESS_DAYS * 86400_000, intervalMinutes * 2 * 60_000),
  );
  await serializable(prisma, async (tx) => {
    const existing = await tx.coupon.findUnique({
      where: { merchantId_code: { merchantId, code: coupon.code } },
    });
    // Manual curation wins; an automated observation must not erase its source or expiry.
    if (existing?.source === CouponSource.MANUAL) return;
    const details =
      source === 'API'
        ? {
            description: coupon.description,
            discountType: normalizeDiscountType(coupon.discountType),
            discountValue: coupon.discountValue,
            expiresAt: coupon.expiresAt ?? null,
            source: CouponSource.API,
          }
        : {};
    if (existing) {
      await tx.coupon.update({
        where: { id: existing.id },
        data: {
          ...details,
          lastSeenAt: now,
          freshUntil,
          ...(source === 'SCRAPE' && existing.source === CouponSource.SCRAPE
            ? { expiresAt: null }
            : {}),
          // Deliberately omit active: false is an explicit operator decision.
        },
      });
    } else {
      await tx.coupon.create({
        data: {
          merchantId,
          code: coupon.code,
          source,
          ...details,
          lastSeenAt: now,
          freshUntil,
        },
      });
    }
  });
}
