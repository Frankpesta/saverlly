import { SetMetadata } from '@nestjs/common';

export enum TenantResourceType {
  KIOSK = 'kiosk',
  LOCATION = 'location',
  DEVICE = 'device',
  USER = 'user',
  ANNOUNCEMENT = 'announcement',
  /** Read-only variant of ANNOUNCEMENT: also lets KIOSK_OWNER/LOCATION_MANAGER view (not
   * mutate) platform-wide broadcasts and announcements scoped to their locations, mirroring
   * AnnouncementsService.findAll's visibility rules. Use only for the GET :id route. */
  ANNOUNCEMENT_VIEW = 'announcement_view',
}

export interface TenantResourceOptions {
  type: TenantResourceType;
  /** Route param key holding the resource's id. Defaults to 'id'. */
  paramKey: string;
}

export const TENANT_RESOURCE_KEY = 'tenantResource';

/**
 * Declares which resource a route operates on, so TenantScopeGuard can resolve
 * its owning kioskId (and locationId, for LOCATION_MANAGER checks) and compare
 * it against the caller's tenant scope. Admins bypass this check entirely.
 */
export const TenantResource = (type: TenantResourceType, paramKey = 'id') =>
  SetMetadata(TENANT_RESOURCE_KEY, { type, paramKey } satisfies TenantResourceOptions);
