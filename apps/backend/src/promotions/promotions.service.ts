import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePromotionDto } from './dto/create-promotion.dto';
import { UpdatePromotionDto } from './dto/update-promotion.dto';

@Injectable()
export class PromotionsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreatePromotionDto) {
    if (new Date(dto.endAt) <= new Date(dto.startAt)) {
      throw new BadRequestException('endAt must be after startAt');
    }
    await this.assertLocationsExist(dto.locationIds);

    return this.prisma.promotion.create({
      data: {
        name: dto.name,
        imageSmallUrl: dto.imageSmallUrl,
        imageLargeUrl: dto.imageLargeUrl,
        clickUrl: dto.clickUrl,
        targetTags: normalizeTags(dto.targetTags),
        locationIds: dto.locationIds ?? [],
        startAt: dto.startAt,
        endAt: dto.endAt,
        active: dto.active ?? true,
      },
    });
  }

  findAll() {
    return this.prisma.promotion.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async findOne(id: string) {
    const promotion = await this.prisma.promotion.findUnique({ where: { id } });
    if (!promotion) {
      throw new NotFoundException('Promotion not found');
    }
    return promotion;
  }

  async update(id: string, dto: UpdatePromotionDto) {
    const existing = await this.findOne(id);
    const startAt = dto.startAt ?? existing.startAt.toISOString();
    const endAt = dto.endAt ?? existing.endAt.toISOString();
    if (new Date(endAt) <= new Date(startAt)) {
      throw new BadRequestException('endAt must be after startAt');
    }
    await this.assertLocationsExist(dto.locationIds);

    return this.prisma.promotion.update({
      where: { id },
      data: {
        name: dto.name,
        imageSmallUrl: dto.imageSmallUrl,
        imageLargeUrl: dto.imageLargeUrl,
        clickUrl: dto.clickUrl,
        // Only rewrite the tag list when the caller actually sent one — a PATCH that omits
        // targetTags must leave the existing tags alone, not blank them.
        targetTags: dto.targetTags ? normalizeTags(dto.targetTags) : undefined,
        locationIds: dto.locationIds,
        startAt: dto.startAt,
        endAt: dto.endAt,
        active: dto.active,
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.promotion.delete({ where: { id } });
  }

  /**
   * Promotions are platform-wide (ADMIN-authored), so locations are validated only for existence —
   * unlike Announcement's locationIds, which additionally have to belong to one specific kiosk.
   */
  private async assertLocationsExist(
    locationIds: string[] | undefined,
  ): Promise<void> {
    if (!locationIds || locationIds.length === 0) {
      return;
    }
    const matching = await this.prisma.location.findMany({
      where: { id: { in: locationIds } },
      select: { id: true },
    });
    if (matching.length !== locationIds.length) {
      throw new BadRequestException('One or more locationIds do not exist');
    }
  }
}

/**
 * Tags are matched against Location.tags, which the dashboard's TagInput writes verbatim. Trimming
 * and lowercasing both sides of that comparison is what makes "Mall" typed here match a location
 * tagged "mall" — without it, targeting silently matches nothing and looks like a backend bug.
 */
function normalizeTags(tags: string[] | undefined): string[] {
  if (!tags) {
    return [];
  }
  const normalized = tags
    .map((tag) => tag.trim().toLowerCase())
    .filter((tag) => tag.length > 0);
  return [...new Set(normalized)];
}
