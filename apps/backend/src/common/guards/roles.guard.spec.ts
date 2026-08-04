import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { RolesGuard } from './roles.guard';

function contextWithUser(user?: { role: UserRole }): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => jest.fn(),
    getClass: () => jest.fn(),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  function buildGuard(requiredRoles: UserRole[] | undefined) {
    const reflector = { getAllAndOverride: () => requiredRoles } as unknown as Reflector;
    return new RolesGuard(reflector);
  }

  it('denies by default when no @Roles() metadata is present', () => {
    const guard = buildGuard(undefined);
    expect(guard.canActivate(contextWithUser({ role: UserRole.ADMIN }))).toBe(false);
  });

  it('denies when @Roles() is present but empty', () => {
    const guard = buildGuard([]);
    expect(guard.canActivate(contextWithUser({ role: UserRole.ADMIN }))).toBe(false);
  });

  it('allows a user whose role is in the required list', () => {
    const guard = buildGuard([UserRole.ADMIN]);
    expect(guard.canActivate(contextWithUser({ role: UserRole.ADMIN }))).toBe(true);
  });

  it('denies a user whose role is not in the required list', () => {
    const guard = buildGuard([UserRole.ADMIN]);
    expect(guard.canActivate(contextWithUser({ role: UserRole.KIOSK_OWNER }))).toBe(false);
  });

  it('denies when there is no authenticated user on the request', () => {
    const guard = buildGuard([UserRole.ADMIN]);
    expect(guard.canActivate(contextWithUser(undefined))).toBe(false);
  });
});
