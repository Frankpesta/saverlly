import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';

/**
 * Default-deny: a route with no @Roles() metadata is rejected, not allowed through.
 * Every protected endpoint must explicitly declare which roles may access it.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return false;
    }

    const request = context.switchToHttp().getRequest();
    const user: JwtPayload | undefined = request.user;

    return !!user && requiredRoles.includes(user.role);
  }
}
