import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
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

    return { lifetimeSaved: result._sum.discountAmount ?? 0 };
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

    return event;
  }
}
