import { ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Shared base for every auth-endpoint throttler guard. Skips throttling entirely under the
 * e2e test suite, where many tests share one long-lived app instance (one per file, per
 * `createTestApp()`) and legitimately log in / refresh far more than any real user would
 * within the same 60s window -- without this, the test suite starts failing with 429s the
 * moment a file's test count exceeds the throttle limit, with nothing actually wrong. Never
 * skips in dev or production.
 */
export abstract class AuthThrottlerGuard extends ThrottlerGuard {
  protected async shouldSkip(_context: ExecutionContext): Promise<boolean> {
    return process.env.NODE_ENV === 'test';
  }
}
