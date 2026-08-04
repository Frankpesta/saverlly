import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCouponTestEventDto } from './dto/create-coupon-test-event.dto';

@Injectable()
export class PublicApiService {
  constructor(private readonly prisma: PrismaService) {}

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
    let event;
    try {
      event = await this.prisma.couponTestEvent.create({
        data: {
          deviceId,
          merchantId: dto.merchantId,
          couponId: dto.couponId,
          result: dto.result,
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
