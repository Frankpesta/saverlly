import { Injectable } from '@nestjs/common';
import { AuthThrottlerGuard } from './auth-throttler.guard';

/**
 * Shared by /auth/login and /auth/forgot-password. Both are proxied server-side through the
 * dashboard's Next.js BFF (apps/dashboard/src/app/api/auth/{login,forgot-password}/route.ts
 * call these endpoints from the Next.js server, not the browser), so a plain IP-keyed
 * ThrottlerGuard sees the *same* source IP for every dashboard user's request -- rate-limiting
 * the whole user base combined instead of one attacker. Key on the target email instead, so
 * hammering one account gets throttled without touching any other account behind the same
 * shared IP.
 */
@Injectable()
export class EmailThrottlerGuard extends AuthThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const email =
      typeof req.body?.email === 'string'
        ? req.body.email.trim().toLowerCase()
        : undefined;
    return email || req.ip;
  }
}
