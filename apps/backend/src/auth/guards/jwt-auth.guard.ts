import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';
import { JwtPayload } from '../interfaces/jwt-payload.interface';

// The only two JwtAuthGuard-protected routes a mustChangePassword:true user must still be
// able to reach — otherwise they could never change their password or log out. Every other
// role-protected endpoint is blocked, not just the dashboard's own proxy redirect (which is
// UX-only and easily bypassed by calling the API directly).
const MUST_CHANGE_PASSWORD_EXEMPT_PATHS = new Set([
  '/auth/change-password',
  '/auth/logout',
]);

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const authenticated = await super.canActivate(context);
    if (!authenticated) {
      return false;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user as JwtPayload;
    if (
      user.mustChangePassword &&
      !MUST_CHANGE_PASSWORD_EXEMPT_PATHS.has(request.path)
    ) {
      throw new UnauthorizedException('Password change required');
    }

    return true;
  }
}
