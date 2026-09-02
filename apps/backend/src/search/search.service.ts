import { Injectable } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { SearchResultDto } from './dto/search-result.dto';

const PER_ENTITY_LIMIT = 5;
const MIN_QUERY_LENGTH = 2;

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search(currentUser: JwtPayload, q: string): Promise<SearchResultDto[]> {
    const term = q.trim();
    if (term.length < MIN_QUERY_LENGTH) {
      return [];
    }

    if (currentUser.role === UserRole.ADMIN) {
      // Announcements are deliberately absent here: they are a kiosk-owner portal feature now,
      // and admin has no /admin/announcements page to land on, so returning one would only ever
      // produce a dead search result.
      const [locations, devices, kiosks, merchants, coupons] =
        await Promise.all([
          this.searchLocations(currentUser, term),
          this.searchDevices(currentUser, term),
          this.searchKiosks(term),
          this.searchMerchants(term),
          this.searchCoupons(term),
        ]);
      return [...locations, ...devices, ...kiosks, ...merchants, ...coupons];
    }

    // KIOSK_OWNER / LOCATION_MANAGER: Kiosk list, Merchant, and Coupon are admin-only
    // resources today (KiosksController/MerchantsController/CouponsController all gate their
    // list endpoints to ADMIN) — search must not open a side-channel into data these roles
    // can't otherwise list, so those branches are never even called here.
    const [locations, devices, announcements] = await Promise.all([
      this.searchLocations(currentUser, term),
      this.searchDevices(currentUser, term),
      this.searchAnnouncements(currentUser, term),
    ]);
    return [...locations, ...devices, ...announcements];
  }

  // Mirrors LocationsService.findAll's role-scoping exactly, ANDed with a text filter.
  private async searchLocations(
    currentUser: JwtPayload,
    term: string,
  ): Promise<SearchResultDto[]> {
    const textFilter: Prisma.LocationWhereInput = {
      OR: [
        { name: { contains: term, mode: 'insensitive' } },
        { address: { contains: term, mode: 'insensitive' } },
        { city: { contains: term, mode: 'insensitive' } },
      ],
    };

    let scope: Prisma.LocationWhereInput;
    if (currentUser.role === UserRole.ADMIN) {
      scope = {};
    } else if (currentUser.role === UserRole.LOCATION_MANAGER) {
      const manager = await this.prisma.user.findUnique({
        where: { id: currentUser.sub },
        select: { managedLocationIds: true },
      });
      scope = { id: { in: manager?.managedLocationIds ?? [] } };
    } else {
      // KIOSK_OWNER
      if (!currentUser.kioskId) {
        return []; // fail closed rather than send Prisma an unscoped/null kioskId filter
      }
      scope = { kioskId: currentUser.kioskId };
    }

    const rows = await this.prisma.location.findMany({
      where: { AND: [scope, textFilter] },
      take: PER_ENTITY_LIMIT,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((l) => ({
      type: 'location' as const,
      id: l.id,
      title: l.name,
      subtitle: [l.address, l.city].filter(Boolean).join(', ') || null,
    }));
  }

  // Mirrors DevicesService.findAll's role-scoping exactly, ANDed with a text filter on `label`.
  private async searchDevices(
    currentUser: JwtPayload,
    term: string,
  ): Promise<SearchResultDto[]> {
    const textFilter: Prisma.DeviceWhereInput = {
      label: { contains: term, mode: 'insensitive' },
    };

    let scope: Prisma.DeviceWhereInput;
    if (currentUser.role === UserRole.ADMIN) {
      scope = {};
    } else if (currentUser.role === UserRole.LOCATION_MANAGER) {
      const manager = await this.prisma.user.findUnique({
        where: { id: currentUser.sub },
        select: { managedLocationIds: true },
      });
      scope = { locationId: { in: manager?.managedLocationIds ?? [] } };
    } else {
      // KIOSK_OWNER
      if (!currentUser.kioskId) {
        return [];
      }
      scope = { location: { kioskId: currentUser.kioskId } };
    }

    const rows = await this.prisma.device.findMany({
      where: { AND: [scope, textFilter] },
      take: PER_ENTITY_LIMIT,
      orderBy: { createdAt: 'desc' },
      include: { location: { select: { name: true } } },
    });
    return rows.map((d) => ({
      type: 'device' as const,
      id: d.id,
      title: d.label,
      subtitle: d.location.name,
    }));
  }

  // Mirrors AnnouncementsService.findAll's role-scoping exactly, including broadcast (kioskId:
  // null) visibility and the location-manager's locationIds overlap, which can't be expressed
  // as a Prisma `in` clause and so is applied in-memory (take/slice happens after that filter).
  private async searchAnnouncements(
    currentUser: JwtPayload,
    term: string,
  ): Promise<SearchResultDto[]> {
    const textFilter: Prisma.AnnouncementWhereInput = {
      OR: [
        { title: { contains: term, mode: 'insensitive' } },
        { body: { contains: term, mode: 'insensitive' } },
      ],
    };

    if (currentUser.role === UserRole.ADMIN) {
      const rows = await this.prisma.announcement.findMany({
        where: textFilter,
        take: PER_ENTITY_LIMIT,
        orderBy: { createdAt: 'desc' },
      });
      return rows.map(toAnnouncementResult);
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
      const rows = await this.prisma.announcement.findMany({
        where: { AND: [{ OR: [{ kioskId }, { kioskId: null }] }, textFilter] },
        orderBy: { createdAt: 'desc' },
      });
      return rows
        .filter(
          (a) =>
            a.locationIds.length === 0 ||
            a.locationIds.some((id) => managedLocationIds.includes(id)),
        )
        .slice(0, PER_ENTITY_LIMIT)
        .map(toAnnouncementResult);
    }

    // KIOSK_OWNER
    if (!currentUser.kioskId) {
      return [];
    }
    const rows = await this.prisma.announcement.findMany({
      where: {
        AND: [
          { OR: [{ kioskId: currentUser.kioskId }, { kioskId: null }] },
          textFilter,
        ],
      },
      take: PER_ENTITY_LIMIT,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toAnnouncementResult);
  }

  // Admin-only: Kiosk list has no owner/manager access at all today (KiosksController.findAll).
  private async searchKiosks(term: string): Promise<SearchResultDto[]> {
    const rows = await this.prisma.kiosk.findMany({
      where: { name: { contains: term, mode: 'insensitive' } },
      take: PER_ENTITY_LIMIT,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((k) => ({
      type: 'kiosk' as const,
      id: k.id,
      title: k.name,
      subtitle: k.status,
    }));
  }

  // Admin-only: merchants are platform-global with no tenant concept (MerchantsController).
  private async searchMerchants(term: string): Promise<SearchResultDto[]> {
    const rows = await this.prisma.merchant.findMany({
      where: { name: { contains: term, mode: 'insensitive' } },
      take: PER_ENTITY_LIMIT,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((m) => ({
      type: 'merchant' as const,
      id: m.id,
      title: m.name,
      subtitle: m.domain,
    }));
  }

  // Admin-only: coupons aren't kiosk-owned (CouponsController).
  private async searchCoupons(term: string): Promise<SearchResultDto[]> {
    const rows = await this.prisma.coupon.findMany({
      where: {
        OR: [
          { code: { contains: term, mode: 'insensitive' } },
          { description: { contains: term, mode: 'insensitive' } },
        ],
      },
      take: PER_ENTITY_LIMIT,
      orderBy: { createdAt: 'desc' },
      include: { merchant: { select: { name: true } } },
    });
    return rows.map((c) => ({
      type: 'coupon' as const,
      id: c.id,
      title: c.code,
      subtitle: c.merchant.name,
    }));
  }
}

function toAnnouncementResult(a: {
  id: string;
  title: string;
  body: string;
  kioskId: string | null;
}): SearchResultDto {
  return {
    type: 'announcement',
    id: a.id,
    title: a.title,
    subtitle: a.kioskId === null ? 'Platform-wide' : a.body.slice(0, 80),
  };
}
