import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CouponSource, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCouponDto } from './dto/create-coupon.dto';
import { UpdateCouponDto } from './dto/update-coupon.dto';

@Injectable()
export class CouponsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateCouponDto) {
    await this.assertMerchantExists(dto.merchantId);

    try {
      return await this.prisma.coupon.create({
        data: {
          merchantId: dto.merchantId,
          code: dto.code,
          description: dto.description,
          source: CouponSource.MANUAL,
          discountType: dto.discountType,
          discountValue: dto.discountValue,
          expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
        },
      });
    } catch (err) {
      throw this.mapDuplicateConflict(err);
    }
  }

  findAll(merchantId?: string, limit = 50, cursor?: string) {
    return this.prisma.coupon.findMany({
      where: merchantId ? { merchantId } : undefined,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
  }

  async findOneOrThrow(id: string) {
    const coupon = await this.prisma.coupon.findUnique({ where: { id } });
    if (!coupon) {
      throw new NotFoundException('Coupon not found');
    }
    return coupon;
  }

  async update(id: string, dto: UpdateCouponDto) {
    await this.findOneOrThrow(id);
    try {
      return await this.prisma.coupon.update({
        where: { id },
        data: {
          code: dto.code,
          description: dto.description,
          discountType: dto.discountType,
          discountValue: dto.discountValue,
          expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
          active: dto.active,
        },
      });
    } catch (err) {
      throw this.mapDuplicateConflict(err);
    }
  }

  async remove(id: string) {
    await this.findOneOrThrow(id);
    await this.prisma.coupon.delete({ where: { id } });
  }

  private async assertMerchantExists(merchantId: string) {
    const merchant = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
      select: { id: true },
    });
    if (!merchant) {
      throw new NotFoundException('Merchant not found');
    }
  }

  private mapDuplicateConflict(err: unknown): unknown {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return new ConflictException('A coupon with this code already exists for this merchant');
    }
    return err;
  }
}
