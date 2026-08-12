import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import {
  TENANT_RESOURCE_KEY,
  TenantResourceOptions,
  TenantResourceType,
} from '../decorators/tenant-resource.decorator';

interface ResourceScope {
  // null only ever occurs for a platform-wide broadcast Announcement — the strict !== comparison
  // below correctly denies every non-admin caller for those (null never equals a real kiosk id),
  // which is the intended behavior: only ADMIN (who bypasses this guard entirely) can reach one.
  kioskId: string | null;
  locationId?: string;
}

/**
 * Enforces that KIOSK_OWNER / LOCATION_MANAGER callers can only reach resources
 * belonging to their own kiosk (and, for LOCATION_MANAGER, their own assigned
 * locations). ADMIN bypasses this check. Must run after JwtAuthGuard + RolesGuard,
 * since it relies on request.user already being populated.
 *
 * Only applies to single-resource routes with an :id-style param — list endpoints
 * must filter by tenant at the query level in their service instead, since there's
 * no resource id to resolve here.
 */
@Injectable()
export class TenantScopeGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const options = this.reflector.getAllAndOverride<
      TenantResourceOptions | undefined
    >(TENANT_RESOURCE_KEY, [context.getHandler(), context.getClass()]);

    const request = context.switchToHttp().getRequest();
    const user: JwtPayload | undefined = request.user;
    if (!user) {
      return false;
    }

    if (user.role === UserRole.ADMIN) {
      return true;
    }

    if (!options) {
      // No resource declared — for non-admin roles, fail closed rather than assume unscoped access.
      return false;
    }

    const resourceId = request.params?.[options.paramKey];
    if (!resourceId) {
      return false;
    }

    const scope = await this.resolveScope(options.type, resourceId);
    if (!scope || scope.kioskId !== user.kioskId) {
      return false;
    }

    if (user.role === UserRole.LOCATION_MANAGER) {
      if (!scope.locationId) {
        return false; // kiosk-level resource, out of a location-manager's reach
      }
      const manager = await this.prisma.user.findUnique({
        where: { id: user.sub },
        select: { managedLocationIds: true },
      });
      if (!manager?.managedLocationIds.includes(scope.locationId)) {
        return false;
      }
    }

    return true;
  }

  private async resolveScope(
    type: TenantResourceType,
    id: string,
  ): Promise<ResourceScope | null> {
    switch (type) {
      case TenantResourceType.KIOSK: {
        const kiosk = await this.prisma.kiosk.findUnique({
          where: { id },
          select: { id: true },
        });
        return kiosk ? { kioskId: kiosk.id } : null;
      }
      case TenantResourceType.LOCATION: {
        const location = await this.prisma.location.findUnique({
          where: { id },
          select: { id: true, kioskId: true },
        });
        return location
          ? { kioskId: location.kioskId, locationId: location.id }
          : null;
      }
      case TenantResourceType.DEVICE: {
        const device = await this.prisma.device.findUnique({
          where: { id },
          select: { locationId: true, location: { select: { kioskId: true } } },
        });
        return device
          ? { kioskId: device.location.kioskId, locationId: device.locationId }
          : null;
      }
      case TenantResourceType.USER: {
        const targetUser = await this.prisma.user.findUnique({
          where: { id },
          select: { kioskId: true },
        });
        return targetUser?.kioskId ? { kioskId: targetUser.kioskId } : null;
      }
      case TenantResourceType.ANNOUNCEMENT: {
        const announcement = await this.prisma.announcement.findUnique({
          where: { id },
          select: { kioskId: true },
        });
        // No single locationId — announcements can span multiple/all locations.
        // Routes using this type must not be reachable by LOCATION_MANAGER.
        return announcement ? { kioskId: announcement.kioskId } : null;
      }
    }
  }
}
