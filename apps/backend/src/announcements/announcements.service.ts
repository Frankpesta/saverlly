import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AnnouncementRepeatPolicy, UserRole } from '@prisma/client';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { UpdateAnnouncementDto } from './dto/update-announcement.dto';

@Injectable()
export class AnnouncementsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(currentUser: JwtPayload, dto: CreateAnnouncementDto) {
    const kioskId = currentUser.role === UserRole.ADMIN ? dto.kioskId : currentUser.kioskId;
    if (!kioskId) {
      throw new BadRequestException('kioskId is required');
    }
    const kiosk = await this.prisma.kiosk.findUnique({ where: { id: kioskId }, select: { id: true } });
    if (!kiosk) {
      throw new NotFoundException('Kiosk not found');
    }
    if (new Date(dto.endAt) <= new Date(dto.startAt)) {
      throw new BadRequestException('endAt must be after startAt');
    }
    await this.assertLocationsBelongToKiosk(kioskId, dto.locationIds);
    const repeatPolicy = dto.repeatPolicy ?? AnnouncementRepeatPolicy.ONCE;
    this.assertValidMaxDisplayCount(repeatPolicy, dto.maxDisplayCount);

    return this.prisma.announcement.create({
      data: {
        kioskId,
        locationIds: dto.locationIds ?? [],
        title: dto.title,
        body: dto.body,
        mediaUrl: dto.mediaUrl,
        startAt: dto.startAt,
        endAt: dto.endAt,
        repeatPolicy,
        maxDisplayCount: dto.maxDisplayCount,
      },
    });
  }

  async findAll(currentUser: JwtPayload) {
    if (currentUser.role === UserRole.ADMIN) {
      return this.prisma.announcement.findMany({ orderBy: { createdAt: 'desc' } });
    }

    if (currentUser.role === UserRole.LOCATION_MANAGER) {
      const manager = await this.prisma.user.findUnique({
        where: { id: currentUser.sub },
        select: { managedLocationIds: true, kioskId: true },
      });
      const kioskId = manager?.kioskId ?? currentUser.kioskId;
      if (!kioskId) {
        return []; // fail closed rather than send Prisma an unscoped/null kioskId filter
      }
      const managedLocationIds = manager?.managedLocationIds ?? [];
      const all = await this.prisma.announcement.findMany({
        where: { kioskId },
        orderBy: { createdAt: 'desc' },
      });
      // Scoped to their assigned location(s): either the announcement targets
      // all locations (empty array) or overlaps their managed set.
      return all.filter(
        (a) => a.locationIds.length === 0 || a.locationIds.some((id) => managedLocationIds.includes(id)),
      );
    }

    // KIOSK_OWNER
    if (!currentUser.kioskId) {
      return []; // fail closed rather than send Prisma an unscoped/null kioskId filter
    }
    return this.prisma.announcement.findMany({
      where: { kioskId: currentUser.kioskId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const announcement = await this.prisma.announcement.findUnique({ where: { id } });
    if (!announcement) {
      throw new NotFoundException('Announcement not found');
    }
    return announcement;
  }

  async update(id: string, dto: UpdateAnnouncementDto) {
    const existing = await this.findOne(id);
    const startAt = dto.startAt ?? existing.startAt.toISOString();
    const endAt = dto.endAt ?? existing.endAt.toISOString();
    if (new Date(endAt) <= new Date(startAt)) {
      throw new BadRequestException('endAt must be after startAt');
    }
    await this.assertLocationsBelongToKiosk(existing.kioskId, dto.locationIds);
    const repeatPolicy = dto.repeatPolicy ?? existing.repeatPolicy;
    const maxDisplayCount = dto.maxDisplayCount !== undefined ? dto.maxDisplayCount : existing.maxDisplayCount;
    this.assertValidMaxDisplayCount(repeatPolicy, maxDisplayCount);

    return this.prisma.announcement.update({
      where: { id },
      data: {
        locationIds: dto.locationIds,
        title: dto.title,
        body: dto.body,
        mediaUrl: dto.mediaUrl,
        startAt: dto.startAt,
        endAt: dto.endAt,
        repeatPolicy: dto.repeatPolicy,
        maxDisplayCount: dto.maxDisplayCount,
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.announcement.delete({ where: { id } });
  }

  /** Empty/omitted locationIds means "all locations for the kiosk" — nothing to validate. */
  private async assertLocationsBelongToKiosk(kioskId: string, locationIds: string[] | undefined): Promise<void> {
    if (!locationIds || locationIds.length === 0) {
      return;
    }
    const matching = await this.prisma.location.findMany({
      where: { id: { in: locationIds }, kioskId },
      select: { id: true },
    });
    if (matching.length !== locationIds.length) {
      throw new BadRequestException('One or more locationIds do not exist or do not belong to this kiosk');
    }
  }

  private assertValidMaxDisplayCount(
    repeatPolicy: AnnouncementRepeatPolicy,
    maxDisplayCount: number | null | undefined,
  ): void {
    const isValid = typeof maxDisplayCount === 'number' && maxDisplayCount >= 1;
    if (repeatPolicy === AnnouncementRepeatPolicy.MAX_N_TIMES && !isValid) {
      throw new BadRequestException('maxDisplayCount must be a positive integer when repeatPolicy is MAX_N_TIMES');
    }
  }
}
