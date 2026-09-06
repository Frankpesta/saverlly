import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { AuthThrottlerGuard } from './auth-throttler.guard';

/**
 * Same shared-IP problem as LoginThrottlerGuard/RefreshThrottlerGuard -- reset-password is
 * also proxied through the dashboard's Next.js BFF. Key on the reset token itself (hashed)
 * instead of IP, so the limit tracks attempts against one specific reset link, not every user
 * behind the same proxy IP.
 */
@Injectable()
export class ResetTokenThrottlerGuard extends AuthThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const token =
      typeof req.body?.token === 'string' ? req.body.token : undefined;
    if (!token) {
      return req.ip;
    }
    return createHash('sha256').update(token).digest('hex');
  }
}
