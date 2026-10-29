import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';
import {
  AuthenticatedStoreSetupSession,
  StoreSetupService,
} from './store-setup.service';

type SetupSessionRequest = Request & {
  storeSetupSession?: AuthenticatedStoreSetupSession;
};

/**
 * Auth for the extension's store-setup routes. Accepts only a redeemed store-setup token, which
 * is a separate credential from device, reviewer and admin JWT auth: none of those work here,
 * and a setup token works nowhere else.
 */
@Injectable()
export class SetupSessionGuard implements CanActivate {
  constructor(private readonly storeSetup: StoreSetupService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<SetupSessionRequest>();
    const auth = request.headers.authorization;
    request.storeSetupSession = await this.storeSetup.authenticate(
      auth?.startsWith('Bearer ') ? auth.slice('Bearer '.length) : '',
    );
    return true;
  }
}

/** Rate-limits by IP before the token is checked, so guessed or stale tokens can't hit the
 * database unthrottled. Runs before SetupSessionGuard; the per-session limit follows it. */
@Injectable()
export class SetupSessionIpThrottlerGuard extends ThrottlerGuard {
  protected getTracker(req: Record<string, any>): Promise<string> {
    return Promise.resolve(`ip:${(req as Request).ip ?? 'unknown'}`);
  }
}

/** Rate-limits per setup session rather than per IP, since kiosks share a store network. Must
 * run after SetupSessionGuard, which populates request.storeSetupSession. */
@Injectable()
export class SetupSessionThrottlerGuard extends ThrottlerGuard {
  protected getTracker(req: Record<string, any>): Promise<string> {
    const request = req as SetupSessionRequest;
    return Promise.resolve(
      request.storeSetupSession?.id ?? request.ip ?? 'unknown',
    );
  }
}

export const CurrentStoreSetupSession = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedStoreSetupSession =>
    // Only used behind SetupSessionGuard, which always sets it or throws.
    ctx.switchToHttp().getRequest<SetupSessionRequest>().storeSetupSession!,
);
