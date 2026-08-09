import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { generateSubId } from '../common/crypto/sub-id.util';
import { PrismaService } from '../prisma/prisma.service';
import { ActiveAnnouncementDto } from './dto/active-announcement.dto';
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

  async getActiveAnnouncements(deviceId: string): Promise<ActiveAnnouncementDto[]> {
    const device = await this.prisma.device.findUniqueOrThrow({
      where: { id: deviceId },
      select: { locationId: true, location: { select: { kioskId: true } } },
    });

    const now = new Date();
    const announcements = await this.prisma.announcement.findMany({
      where: {
        kioskId: device.location.kioskId,
        startAt: { lte: now },
        endAt: { gte: now },
        OR: [{ locationIds: { isEmpty: true } }, { locationIds: { has: device.locationId } }],
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
      throw new BadRequestException('discountAmount is required when result is "applied"');
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
          discountAmount: dto.result === 'applied' ? dto.discountAmount : undefined,
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
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

    return { ...event, discountAmount: event.discountAmount?.toNumber() ?? null };
  }

  async mintAttributionAttempt(deviceId: string, merchantId: string): Promise<AttributionAttemptDto> {
    const merchant = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
      select: { id: true },
    });
    if (!merchant) {
      throw new BadRequestException('merchantId does not exist');
    }

    const attempt = await this.prisma.attributionAttempt.create({
      data: { deviceId, merchantId, subId: generateSubId(deviceId) },
    });

    return { subId: attempt.subId };
  }
}
