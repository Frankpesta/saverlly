import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { AuthThrottlerGuard } from './auth-throttler.guard';

/**
 * Same shared-IP problem as LoginThrottlerGuard -- every refresh is also proxied through the
 * dashboard's Next.js BFF. Key on the refresh token itself (hashed, so the raw token never
 * ends up sitting in throttler storage) instead of IP, so the limit tracks one session
 * hammering /auth/refresh, not every user behind the same proxy IP.
 */
@Injectable()
export class RefreshThrottlerGuard extends AuthThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const token =
      typeof req.body?.refreshToken === 'string'
        ? req.body.refreshToken
        : undefined;
    if (!token) {
      return req.ip;
    }
    return createHash('sha256').update(token).digest('hex');
  }
}
