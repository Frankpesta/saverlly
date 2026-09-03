import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { parseAnnouncementLayout } from '@saverlly/shared-types';
import { generateSubId } from '../common/crypto/sub-id.util';
import { PrismaService } from '../prisma/prisma.service';
import { ActiveAnnouncementDto } from './dto/active-announcement.dto';
import { ActivePromotionDto } from './dto/active-promotion.dto';
import { AttributionAttemptDto } from './dto/attribution-attempt.dto';
import { CreateCouponTestEventDto } from './dto/create-coupon-test-event.dto';
import { DeviceStatusDto } from './dto/device-status.dto';
import { LifetimeSavingsDto } from './dto/lifetime-savings.dto';

@Injectable()
export class PublicApiService {
  constructor(private readonly prisma: PrismaService) {}

  async getDeviceStatus(deviceId: string): Promise<DeviceStatusDto> {
    const device = await this.prisma.device.findUniqueOrThrow({
      where: { id: deviceId },
      select: {
        active: true,
        location: { select: { kiosk: { select: { status: true } } } },
      },
    });

    return {
      kioskStatus: device.location.kiosk.status,
      deviceActive: device.active,
    };
  }

  async getLifetimeSavings(deviceId: string): Promise<LifetimeSavingsDto> {
    const result = await this.prisma.couponTestEvent.aggregate({
      where: { deviceId, result: 'applied' },
      _sum: { discountAmount: true },
    });

    return { lifetimeSaved: result._sum.discountAmount?.toNumber() ?? 0 };
  }

  async getActiveAnnouncements(
    deviceId: string,
  ): Promise<ActiveAnnouncementDto[]> {
    const device = await this.prisma.device.findUniqueOrThrow({
      where: { id: deviceId },
      select: { locationId: true, location: { select: { kioskId: true } } },
    });

    const now = new Date();
    const announcements = await this.prisma.announcement.findMany({
      where: {
        // Platform-wide broadcasts (kioskId: null) show on every device regardless of kiosk.
        OR: [{ kioskId: device.location.kioskId }, { kioskId: null }],
        startAt: { lte: now },
        endAt: { gte: now },
        AND: [
          {
            OR: [
              { locationIds: { isEmpty: true } },
              { locationIds: { has: device.locationId } },
            ],
          },
        ],
      },
      orderBy: { startAt: 'asc' },
    });

    return announcements.map((a) => ({
      id: a.id,
      title: a.title,
      body: a.body,
      mediaUrl: a.mediaUrl,
      repeatPolicy: a.repeatPolicy,
      maxDisplayCount: a.maxDisplayCount,
      // Re-parsed on the way out as well as on the way in: rows written before the sanitizer
      // existed, or edited directly in the database, would otherwise reach the kiosk renderer
      // unchecked. A layout that no longer parses degrades to null, which the agent handles by
      // falling back to the default title/body/image design.
      layout: parseAnnouncementLayout(a.layout),
    }));
  }

  async getActivePromotions(deviceId: string): Promise<ActivePromotionDto[]> {
    const device = await this.prisma.device.findUniqueOrThrow({
      where: { id: deviceId },
      select: { locationId: true, location: { select: { tags: true } } },
    });

    const now = new Date();
    const promotions = await this.prisma.promotion.findMany({
      where: { active: true, startAt: { lte: now }, endAt: { gte: now } },
      orderBy: { startAt: 'asc' },
    });

    // Tag matching is done here rather than as a Prisma `hasSome` filter because Postgres array
    // comparison is case-sensitive: Location.tags is stored verbatim as the dashboard's TagInput
    // wrote it, while Promotion.targetTags is normalized to lowercase on write. Comparing the two
    // in SQL would silently match nothing whenever a location was tagged "Mall" instead of "mall".
    const locationTags = new Set(
      device.location.tags.map((tag) => tag.trim().toLowerCase()),
    );

    return promotions
      .filter((p) => {
        // Untargeted (both lists empty) = platform-wide, shows on every device.
        if (p.targetTags.length === 0 && p.locationIds.length === 0) {
          return true;
        }
        // Union, not intersection. Either targeting dimension matching is enough.
        return (
          p.locationIds.includes(device.locationId) ||
          p.targetTags.some((tag) => locationTags.has(tag))
        );
      })
      .map((p) => ({
        id: p.id,
        imageSmallUrl: p.imageSmallUrl,
        imageLargeUrl: p.imageLargeUrl,
        clickUrl: p.clickUrl,
      }));
  }

  async getMerchantByDomain(domain: string) {
    const merchant = await this.prisma.merchant.findUnique({
      where: { domain: domain.toLowerCase() },
      include: {
        coupons: {
          where: { active: true },
          orderBy: [{ successCount: 'desc' }, { failCount: 'asc' }],
        },
      },
    });

    if (!merchant || !merchant.active) {
      throw new NotFoundException('Merchant not found or inactive');
    }

    return merchant;
  }

  async recordCouponTestEvent(deviceId: string, dto: CreateCouponTestEventDto) {
    if (dto.result === 'applied' && typeof dto.discountAmount !== 'number') {
      throw new BadRequestException(
        'discountAmount is required when result is "applied"',
      );
    }

    if (dto.couponId) {
      const coupon = await this.prisma.coupon.findUnique({
        where: { id: dto.couponId },
        select: { merchantId: true },
      });
      if (!coupon || coupon.merchantId !== dto.merchantId) {
        throw new BadRequestException('couponId does not belong to merchantId');
      }
    }

    let event;
    try {
      event = await this.prisma.couponTestEvent.create({
        data: {
          deviceId,
          merchantId: dto.merchantId,
          couponId: dto.couponId,
          result: dto.result,
          discountAmount:
            dto.result === 'applied' ? dto.discountAmount : undefined,
        },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2003'
      ) {
        throw new BadRequestException('merchantId or couponId does not exist');
      }
      throw err;
    }

    if (dto.couponId && (dto.result === 'applied' || dto.result === 'failed')) {
      await this.prisma.coupon.update({
        where: { id: dto.couponId },
        data: {
          successCount: dto.result === 'applied' ? { increment: 1 } : undefined,
          failCount: dto.result === 'failed' ? { increment: 1 } : undefined,
          lastTestedAt: new Date(),
        },
      });
    }

    return {
      ...event,
      discountAmount: event.discountAmount?.toNumber() ?? null,
    };
  }

  async mintAttributionAttempt(
    deviceId: string,
    merchantId: string,
  ): Promise<AttributionAttemptDto> {
    const merchant = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
      select: { id: true },
    });
    if (!merchant) {
      throw new BadRequestException('merchantId does not exist');
    }

    const attempt = await this.prisma.attributionAttempt.create({
      data: { deviceId, merchantId, subId: generateSubId() },
    });

    return { subId: attempt.subId };
  }
}
