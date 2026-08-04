import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AttributionMethod, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMerchantDto } from './dto/create-merchant.dto';
import { UpdateMerchantDto } from './dto/update-merchant.dto';

@Injectable()
export class MerchantsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateMerchantDto) {
    if (dto.affiliateProgramId) {
      await this.assertAffiliateProgramExists(dto.affiliateProgramId);
    }

    try {
      return await this.prisma.merchant.create({
        data: {
          name: dto.name,
          domain: dto.domain.toLowerCase(),
          attributionMethod: dto.attributionMethod,
          affiliateTrackingUrl: dto.affiliateTrackingUrl,
          affiliateUrlParamKey: dto.affiliateUrlParamKey,
          affiliateUrlParamValue: dto.affiliateUrlParamValue,
          affiliateProgramId: dto.affiliateProgramId,
          checkoutRecipe: dto.checkoutRecipe
            ? (dto.checkoutRecipe as unknown as Prisma.InputJsonValue)
            : undefined,
        },
      });
    } catch (err) {
      throw this.mapDomainConflict(err);
    }
  }

  findAll() {
    return this.prisma.merchant.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async findOneOrThrow(id: string) {
    const merchant = await this.prisma.merchant.findUnique({ where: { id } });
    if (!merchant) {
      throw new NotFoundException('Merchant not found');
    }
    return merchant;
  }

  async update(id: string, dto: UpdateMerchantDto) {
    const existing = await this.findOneOrThrow(id);

    if (dto.affiliateProgramId) {
      await this.assertAffiliateProgramExists(dto.affiliateProgramId);
    }

    const resultingMethod = dto.attributionMethod ?? existing.attributionMethod;
    this.assertTrackingFieldsPresent(resultingMethod, {
      affiliateTrackingUrl: dto.affiliateTrackingUrl ?? existing.affiliateTrackingUrl,
      affiliateUrlParamKey: dto.affiliateUrlParamKey ?? existing.affiliateUrlParamKey,
      affiliateUrlParamValue: dto.affiliateUrlParamValue ?? existing.affiliateUrlParamValue,
    });

    try {
      return await this.prisma.merchant.update({
        where: { id },
        data: {
          name: dto.name,
          domain: dto.domain?.toLowerCase(),
          attributionMethod: dto.attributionMethod,
          affiliateTrackingUrl: dto.affiliateTrackingUrl,
          affiliateUrlParamKey: dto.affiliateUrlParamKey,
          affiliateUrlParamValue: dto.affiliateUrlParamValue,
          affiliateProgramId: dto.affiliateProgramId,
          active: dto.active,
          checkoutRecipe: dto.checkoutRecipe
            ? (dto.checkoutRecipe as unknown as Prisma.InputJsonValue)
            : undefined,
        },
      });
    } catch (err) {
      throw this.mapDomainConflict(err);
    }
  }

  async remove(id: string) {
    await this.findOneOrThrow(id);
    await this.prisma.merchant.delete({ where: { id } });
  }

  private mapDomainConflict(err: unknown): unknown {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return new ConflictException('A merchant with this domain already exists');
    }
    return err;
  }

  private assertTrackingFieldsPresent(
    method: AttributionMethod,
    fields: {
      affiliateTrackingUrl: string | null;
      affiliateUrlParamKey: string | null;
      affiliateUrlParamValue: string | null;
    },
  ) {
    if (
      (method === AttributionMethod.COOKIE || method === AttributionMethod.BOTH) &&
      !fields.affiliateTrackingUrl
    ) {
      throw new BadRequestException('affiliateTrackingUrl is required for COOKIE/BOTH attribution');
    }
    if (
      (method === AttributionMethod.URL_PARAM || method === AttributionMethod.BOTH) &&
      (!fields.affiliateUrlParamKey || !fields.affiliateUrlParamValue)
    ) {
      throw new BadRequestException(
        'affiliateUrlParamKey and affiliateUrlParamValue are required for URL_PARAM/BOTH attribution',
      );
    }
  }

  private async assertAffiliateProgramExists(affiliateProgramId: string) {
    const program = await this.prisma.affiliateProgram.findUnique({
      where: { id: affiliateProgramId },
      select: { id: true },
    });
    if (!program) {
      throw new NotFoundException('Affiliate program not found');
    }
  }
}
