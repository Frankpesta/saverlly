import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AnnouncementRepeatPolicy, Prisma, UserRole } from '@prisma/client';
import { parseAnnouncementLayout } from '@saverlly/shared-types';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { UpdateAnnouncementDto } from './dto/update-announcement.dto';

@Injectable()
export class AnnouncementsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Turns a client-supplied layout into what actually gets stored. The DTO validator already
   * rejected anything unparseable, so this re-parse is not about acceptance — it's about storing
   * the *sanitized* form (clamped dimensions, whitelisted fonts, http(s)-only image URLs) rather
   * than the caller's original JSON. That way the kiosk renderer, which builds an HTML document
   * out of these values, never has to trust the database.
   *
   * `undefined` means "not supplied, leave it alone"; `null` clears the layout back to the
   * default title/body/image rendering, which is how a kiosk owner reverts a design.
   */
  private toStoredLayout(
    layout: unknown,
  ): Prisma.InputJsonValue | typeof Prisma.DbNull | undefined {
    if (layout === undefined) return undefined;
    if (layout === null) return Prisma.DbNull;
    const parsed = parseAnnouncementLayout(layout);
    return parsed === null
      ? Prisma.DbNull
      : (parsed as unknown as Prisma.InputJsonValue);
  }

  async create(currentUser: JwtPayload, dto: CreateAnnouncementDto) {
    const isBroadcast =
      currentUser.role === UserRole.ADMIN && dto.broadcast === true;

    if (dto.broadcast === true && currentUser.role !== UserRole.ADMIN) {
      throw new ForbiddenException(
        'Only an admin can create a platform-wide broadcast',
      );
    }

    if (new Date(dto.endAt) <= new Date(dto.startAt)) {
      throw new BadRequestException('endAt must be after startAt');
    }
    const repeatPolicy = dto.repeatPolicy ?? AnnouncementRepeatPolicy.ONCE;
    this.assertValidMaxDisplayCount(repeatPolicy, dto.maxDisplayCount);

    if (isBroadcast) {
      // A broadcast targets everyone — kioskId and locationIds are meaningless here, so they're
      // ignored even if the client sent them, rather than trusting client intent on something
      // this consequential.
      return this.prisma.announcement.create({
        data: {
          kioskId: null,
          locationIds: [],
          title: dto.title,
          body: dto.body,
          mediaUrl: dto.mediaUrl,
          layout: this.toStoredLayout(dto.layout),
          startAt: dto.startAt,
          endAt: dto.endAt,
          repeatPolicy,
          maxDisplayCount: dto.maxDisplayCount,
        },
      });
    }

    const kioskId =
      currentUser.role === UserRole.ADMIN ? dto.kioskId : currentUser.kioskId;
    if (!kioskId) {
      throw new BadRequestException('kioskId is required');
    }
    const kiosk = await this.prisma.kiosk.findUnique({
      where: { id: kioskId },
      select: { id: true },
    });
    if (!kiosk) {
      throw new NotFoundException('Kiosk not found');
    }
    await this.assertLocationsBelongToKiosk(kioskId, dto.locationIds);

    return this.prisma.announcement.create({
      data: {
        kioskId,
        locationIds: dto.locationIds ?? [],
        title: dto.title,
        body: dto.body,
        mediaUrl: dto.mediaUrl,
        layout: this.toStoredLayout(dto.layout),
        startAt: dto.startAt,
        endAt: dto.endAt,
        repeatPolicy,
        maxDisplayCount: dto.maxDisplayCount,
      },
    });
  }

  async findAll(currentUser: JwtPayload) {
    if (currentUser.role === UserRole.ADMIN) {
      return this.prisma.announcement.findMany({
        orderBy: { createdAt: 'desc' },
      });
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
      // Includes platform-wide broadcasts (kioskId: null) — read-only visibility into what's
      // showing on their own devices, even though they can't open/edit/delete one (TenantScopeGuard
      // blocks that for anyone but ADMIN).
      const all = await this.prisma.announcement.findMany({
        where: { OR: [{ kioskId }, { kioskId: null }] },
        orderBy: { createdAt: 'desc' },
      });
      // Scoped to their assigned location(s): either the announcement targets
      // all locations (empty array — also true for every broadcast) or overlaps their managed set.
      return all.filter(
        (a) =>
          a.locationIds.length === 0 ||
          a.locationIds.some((id) => managedLocationIds.includes(id)),
      );
    }

    // KIOSK_OWNER
    if (!currentUser.kioskId) {
      return []; // fail closed rather than send Prisma an unscoped/null kioskId filter
    }
    // Same broadcast visibility as above.
    return this.prisma.announcement.findMany({
      where: { OR: [{ kioskId: currentUser.kioskId }, { kioskId: null }] },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const announcement = await this.prisma.announcement.findUnique({
      where: { id },
    });
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
    const maxDisplayCount =
      dto.maxDisplayCount !== undefined
        ? dto.maxDisplayCount
        : existing.maxDisplayCount;
    this.assertValidMaxDisplayCount(repeatPolicy, maxDisplayCount);

    return this.prisma.announcement.update({
      where: { id },
      data: {
        locationIds: dto.locationIds,
        title: dto.title,
        body: dto.body,
        mediaUrl: dto.mediaUrl,
        layout: this.toStoredLayout(dto.layout),
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

  /**
   * Empty/omitted locationIds means "all locations for the kiosk" — nothing to validate. A null
   * kioskId is a broadcast, which has no locations to belong to; locationIds must be empty for one
   * (create() enforces this server-side regardless of client input, but update() can reach this
   * with a non-empty list too, so it's rejected explicitly here rather than silently ignored).
   */
  private async assertLocationsBelongToKiosk(
    kioskId: string | null,
    locationIds: string[] | undefined,
  ): Promise<void> {
    if (!locationIds || locationIds.length === 0) {
      return;
    }
    if (kioskId === null) {
      throw new BadRequestException(
        'A platform-wide broadcast cannot be scoped to specific locations',
      );
    }
    const matching = await this.prisma.location.findMany({
      where: { id: { in: locationIds }, kioskId },
      select: { id: true },
    });
    if (matching.length !== locationIds.length) {
      throw new BadRequestException(
        'One or more locationIds do not exist or do not belong to this kiosk',
      );
    }
  }

  private assertValidMaxDisplayCount(
    repeatPolicy: AnnouncementRepeatPolicy,
    maxDisplayCount: number | null | undefined,
  ): void {
    const isValid = typeof maxDisplayCount === 'number' && maxDisplayCount >= 1;
    if (repeatPolicy === AnnouncementRepeatPolicy.MAX_N_TIMES && !isValid) {
      throw new BadRequestException(
        'maxDisplayCount must be a positive integer when repeatPolicy is MAX_N_TIMES',
      );
    }
  }
}
