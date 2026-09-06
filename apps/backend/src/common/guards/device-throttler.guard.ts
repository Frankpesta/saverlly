import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Rate-limits the device-facing public-api routes per authenticated device rather than per
 * IP -- many kiosk devices can share an IP (same store network), and a single compromised or
 * misbehaving device token shouldn't be able to affect any other device's traffic. Must run
 * after DeviceAuthGuard (which populates request.device), so it's applied alongside it at the
 * controller level, not standalone.
 *
 * Also skips entirely under the e2e test suite for the same reason as AuthThrottlerGuard (see
 * apps/backend/src/auth/guards/auth-throttler.guard.ts): many tests share one long-lived app
 * instance and call these routes far more than any real device would within the same window.
 */
@Injectable()
export class DeviceThrottlerGuard extends ThrottlerGuard {
  protected async shouldSkip(_context: ExecutionContext): Promise<boolean> {
    return process.env.NODE_ENV === 'test';
  }

  protected async getTracker(req: Record<string, any>): Promise<string> {
    return req.device?.id ?? req.ip;
  }
}
