import { SetMetadata } from '@nestjs/common';

export enum TenantResourceType {
  KIOSK = 'kiosk',
  LOCATION = 'location',
  DEVICE = 'device',
  USER = 'user',
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
